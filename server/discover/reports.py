"""
Reportes de problema enviados pelo app ("Reportar problema" no menu da musica),
com correcao automatica no servidor. O que nao da para corrigir sozinho fica numa
lista para o admin (GET /reports/view?token=DISCOVER_TOKEN).

Tipos (campo "kind"):
  lyrics_offset   letra fora de sincronia: o app manda o ajuste (offsetMs, o mesmo que
                  ele somou ao tempo de cada linha); o .lrc e regravado com os tempos
                  deslocados. Vale na hora no app e para todo mundo depois do rescan.
  lyrics_wrong    letra de outra musica/versao: busca candidatas (LRCLIB por
  lyrics_missing  artista+titulo+album+duracao, busca aproximada, NetEase como segunda
  lyrics_unsynced fonte), confere titulo, artista e duracao, prefere sincronizada e a
                  de duracao mais proxima, descarta a letra atual e troca o .lrc.
  audio           audio com problema ou faixa errada: acha a faixa no Deezer (ISRC ou
                  artista+titulo+duracao), guarda o arquivo atual como backup oculto e
                  baixa de novo pelo deemix. Se o download nao aparecer em 6 h, o
                  backup volta.
  tags            dados errados: regrava titulo/artista/album/ano/faixa pelo Deezer
                  (via ISRC do arquivo, ou busca com duracao igual).
  cover           capa errada: grava cover.jpg do album do Deezer na pasta do album.
  other           so vai para a lista do admin.

Arquivos antigos (.lrc e capas) ficam em CACHE_DIR/backup antes de qualquer troca.
Revisao periodica: a cada 4 h confere um lote de .lrc da biblioteca e corrige as
suspeitas (letra mais longa que a faixa, [length:] ou [ti:] que nao batem, letra sem
tempo quando existe sincronizada).
"""

import contextlib
import difflib
import logging
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

log = logging.getLogger("discover.reports")

KINDS = ("lyrics_offset", "lyrics_wrong", "lyrics_missing", "lyrics_unsynced",
         "audio", "tags", "cover", "other")
AUDIO_EXT = {".mp3", ".flac", ".m4a", ".ogg", ".opus", ".wav", ".aac", ".wma"}
LRC_TS = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
LRC_TAG = re.compile(r"^\[(ar|ti|al|length|offset|by|re|ve|au):(.*)\]\s*$", re.I)
MAX_OFFSET_MS = 30_000
USER_LIMIT = 30          # reportes por usuario por hora
AUDIO_WAIT = 6 * 3600    # tempo para o deemix entregar o audio novo
REVIEW_EVERY = 4 * 3600
REVIEW_BATCH = int(os.environ.get("LYRICS_REVIEW_BATCH", "500"))
REVIEW_AGAIN_DAYS = 30


# --------------------------------------------------------------------------- #
# LRC
# --------------------------------------------------------------------------- #

def _ms(m: re.Match) -> int:
    frac = m.group(3) or "0"
    frac_ms = int(frac) * (10 if len(frac) == 2 else 100 if len(frac) == 1 else 1)
    return (int(m.group(1)) * 60 + int(m.group(2))) * 1000 + frac_ms


def _fmt(ms: int) -> str:
    ms = max(0, int(round(ms / 10.0)) * 10)
    return f"[{ms // 60000:02d}:{ms // 1000 % 60:02d}.{ms % 1000 // 10:02d}]"


def parse_lrc(text: str) -> dict:
    """{"tags": {...}, "lines": [(ms, texto)], "plain": [texto], "synced": bool}."""
    tags, lines, plain = {}, [], []
    for raw in (text or "").splitlines():
        raw = raw.strip("﻿").rstrip()
        tag = LRC_TAG.match(raw.strip())
        if tag:
            tags[tag.group(1).lower()] = tag.group(2).strip()
            continue
        stamps = list(LRC_TS.finditer(raw))
        if stamps and raw.lstrip().startswith("["):
            body = LRC_TS.sub("", raw).strip()
            for s in stamps:
                lines.append((_ms(s), body))
        elif raw.strip():
            plain.append(raw.strip())
    lines.sort(key=lambda x: x[0])
    offset = tags.get("offset", "").strip()
    if lines and re.fullmatch(r"[+-]?\d+", offset or "x"):
        # LRC: offset positivo adianta a letra
        lines = [(max(0, ms - int(offset)), t) for ms, t in lines]
        tags.pop("offset", None)
    return {"tags": tags, "lines": lines, "plain": plain, "synced": bool(lines)}


def shift_lrc(text: str, offset_ms: int) -> str:
    """Desloca todos os tempos. offset_ms > 0 = letra aparece mais tarde."""
    out = []
    for raw in (text or "").splitlines():
        tag = LRC_TAG.match(raw.strip())
        if tag and tag.group(1).lower() == "offset":
            continue
        out.append(LRC_TS.sub(lambda m: _fmt(_ms(m) + offset_ms), raw))
    return "\n".join(out).rstrip() + "\n"


def lyrics_words(text: str) -> str:
    p = parse_lrc(text)
    body = [t for _, t in p["lines"]] or p["plain"]
    return re.sub(r"\W+", " ", " ".join(body).lower()).strip()


def same_lyrics(a: str, b: str) -> bool:
    wa, wb = lyrics_words(a), lyrics_words(b)
    if not wa or not wb:
        return False
    return difflib.SequenceMatcher(None, wa[:3000], wb[:3000]).ratio() > 0.9


# --------------------------------------------------------------------------- #
# Reportes
# --------------------------------------------------------------------------- #

class Reports:
    def __init__(self, *, db_path: Path, nd_db: Path, music_dir: Path, nd_music_dir: str,
                 backup_dir: Path, deezer, deemix, http_get_json, normalize, normalize_title,
                 split_artists, navidrome_url: str = "", nd_user: str = "", nd_password: str = ""):
        self.db_path = db_path
        self.nd_db = nd_db
        self.music_dir = music_dir
        self.nd_music_dir = nd_music_dir.rstrip("/")
        self.backup_dir = backup_dir
        self.deezer = deezer
        self.deemix = deemix
        self.http_get_json = http_get_json
        self.normalize = normalize
        self.normalize_title = normalize_title
        self.split_artists = split_artists
        self.navidrome_url = navidrome_url.rstrip("/")
        self.nd_user = nd_user
        self.nd_password = nd_password
        self.lock = threading.Lock()
        self.rescan_due = 0.0
        self.recent: dict[str, list[float]] = {}
        with self._db() as conn:
            conn.executescript("""
                create table if not exists reports (
                  id integer primary key autoincrement,
                  user text not null, song_id text not null, kind text not null,
                  title text, artist text, note text, offset_ms integer,
                  status text not null, result text, backup text,
                  created_at real not null, updated_at real not null);
                create index if not exists reports_status on reports(status);
                create table if not exists kv (k text primary key, v text);
                create table if not exists reviewed (song_id text primary key, at real);
            """)

    # ---- infraestrutura ------------------------------------------------- #

    @contextlib.contextmanager
    def _db(self):
        conn = sqlite3.connect(self.db_path, timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _nd_query(self, sql: str, params=()) -> list[sqlite3.Row]:
        """Le o banco do Navidrome sem escrever nele: imutavel primeiro, copia se faltar."""
        def run(conn):
            conn.row_factory = sqlite3.Row
            try:
                return conn.execute(sql, params).fetchall()
            finally:
                conn.close()
        try:
            rows = run(sqlite3.connect(f"file:{self.nd_db}?mode=ro&immutable=1", uri=True))
            if rows:
                return rows
        except sqlite3.Error:
            pass
        tmp = Path(tempfile.mkdtemp(prefix="nd-rep-"))
        try:
            for suffix in ("", "-wal"):
                src = Path(str(self.nd_db) + suffix)
                if src.exists():
                    shutil.copyfile(src, tmp / f"navidrome.db{suffix}")
            return run(sqlite3.connect(tmp / "navidrome.db"))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def song(self, song_id: str) -> dict | None:
        rows = self._nd_query(
            "select id, path, title, artist, album, album_artist, album_id, duration"
            " from media_file where id = ?", (song_id,))
        if not rows:
            return None
        s = dict(rows[0])
        s["file"] = self.local_path(s["path"])
        return s

    def local_path(self, nd_path: str) -> Path | None:
        """Caminho do Navidrome -> caminho neste container, sem sair de MUSIC_DIR."""
        rel = nd_path or ""
        if rel.startswith(self.nd_music_dir + "/"):
            rel = rel[len(self.nd_music_dir) + 1:]
        rel = rel.lstrip("/")
        path = (self.music_dir / rel).resolve()
        root = self.music_dir.resolve()
        if path == root or root not in path.parents:
            return None
        return path

    def allowed(self, user: str) -> bool:
        now = time.time()
        with self.lock:
            recent = [t for t in self.recent.get(user, []) if now - t < 3600]
            if len(recent) >= USER_LIMIT:
                self.recent[user] = recent
                return False
            recent.append(now)
            self.recent[user] = recent
            return True

    def _save(self, user, song, kind, status, result, note=None, offset_ms=None, backup=None) -> int:
        now = time.time()
        with self._db() as conn:
            cur = conn.execute(
                "insert into reports (user, song_id, kind, title, artist, note, offset_ms, status,"
                " result, backup, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?)",
                (user, song["id"], kind, song.get("title"), song.get("artist"), note, offset_ms,
                 status, result, backup, now, now))
            return cur.lastrowid

    def _update(self, rid: int, status: str, result: str, backup=None):
        with self._db() as conn:
            conn.execute("update reports set status = ?, result = ?, backup = ?, updated_at = ?"
                         " where id = ?", (status, result, backup, time.time(), rid))

    def _backup(self, path: Path, label: str) -> str | None:
        if not path.exists():
            return None
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        dest = self.backup_dir / f"{int(time.time())}-{label}-{path.name}"
        shutil.copyfile(path, dest)
        return str(dest)

    def _write(self, path: Path, data: bytes):
        tmp = path.with_name(f".{path.name}.tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)

    def request_rescan(self):
        self.rescan_due = time.time() + 120

    def _rescan(self):
        if not (self.navidrome_url and self.nd_user and self.nd_password):
            return
        params = urllib.parse.urlencode({"u": self.nd_user, "p": self.nd_password, "v": "1.16.1",
                                         "c": "tarsmusic-reports", "f": "json"})
        try:
            with urllib.request.urlopen(f"{self.navidrome_url}/rest/startScan.view?{params}",
                                        timeout=20) as res:
                res.read()
            log.info("Rescan do Navidrome pedido")
        except OSError:
            log.warning("Nao consegui pedir rescan ao Navidrome")

    # ---- entrada -------------------------------------------------------- #

    def handle(self, user: str, body: dict) -> tuple[int, dict]:
        kind = str(body.get("kind") or "")
        song_id = str(body.get("songId") or "").strip()
        note = str(body.get("note") or "").strip()[:1000] or None
        if kind not in KINDS or not re.fullmatch(r"[\w-]{1,64}", song_id):
            return 400, {"error": "kind ou songId invalido"}
        if not self.allowed(user):
            return 429, {"error": "muitos reportes, tente mais tarde"}
        song = self.song(song_id)
        if not song:
            return 404, {"error": "musica nao encontrada"}
        log.info("Reporte %s de %s: %s - %s", kind, user, song["artist"], song["title"])
        if kind == "lyrics_offset":
            try:
                offset = int(body.get("offsetMs"))
            except (TypeError, ValueError):
                return 400, {"error": "offsetMs invalido"}
            if offset == 0 or abs(offset) > MAX_OFFSET_MS:
                return 400, {"error": "offsetMs fora do limite"}
            return 200, self.fix_offset(user, song, offset, note)
        if kind.startswith("lyrics_"):
            return 200, self.fix_lyrics(user, song, kind, note)
        if kind == "audio":
            return 200, self.fix_audio(user, song, note)
        if kind == "tags":
            return 200, self.fix_tags(user, song, note)
        if kind == "cover":
            return 200, self.fix_cover(user, song, note)
        self._save(user, song, kind, "manual", "enviado para o admin", note)
        return 200, {"status": "pending"}

    # ---- letras --------------------------------------------------------- #

    def lrc_path(self, song: dict) -> Path | None:
        return song["file"].with_suffix(".lrc") if song.get("file") else None

    def read_lrc(self, song: dict) -> str | None:
        path = self.lrc_path(song)
        try:
            return path.read_text(encoding="utf-8", errors="replace") if path and path.exists() else None
        except OSError:
            return None

    def fix_offset(self, user, song, offset_ms, note) -> dict:
        path = self.lrc_path(song)
        current = self.read_lrc(song)
        if not path or not current or not parse_lrc(current)["synced"]:
            self._save(user, song, "lyrics_offset", "manual", "sem .lrc sincronizado no servidor",
                       note, offset_ms)
            return {"status": "pending"}
        backup = self._backup(path, song["id"])
        fixed = shift_lrc(current, offset_ms)
        self._write(path, fixed.encode("utf-8"))
        self._save(user, song, "lyrics_offset", "fixed", f"tempos deslocados {offset_ms:+d} ms",
                   note, offset_ms, backup)
        self.request_rescan()
        return {"status": "fixed", "lyrics": fixed}

    def fix_lyrics(self, user, song, kind, note) -> dict:
        current = self.read_lrc(song)
        cand = self.best_lyrics(song, exclude=current if kind == "lyrics_wrong" else None,
                                need_synced=kind == "lyrics_unsynced")
        if cand is None:
            self._save(user, song, kind, "manual", "nenhuma letra confiavel encontrada", note)
            return {"status": "not_found"}
        if cand.get("instrumental"):
            self._save(user, song, kind, "fixed", f"instrumental ({cand['source']})", note)
            return {"status": "instrumental"}
        path = self.lrc_path(song)
        if not path:
            self._save(user, song, kind, "manual", "caminho do arquivo fora da biblioteca", note)
            return {"status": "pending"}
        backup = self._backup(path, song["id"])
        self._write(path, cand["lrc"].encode("utf-8"))
        self._save(user, song, kind, "fixed",
                   f"{'sincronizada' if cand['synced'] else 'sem tempo'} de {cand['source']}"
                   f" (dif. {cand['diff']:.1f} s)", note, backup=backup)
        self.request_rescan()
        return {"status": "fixed", "lyrics": cand["lrc"], "source": cand["source"]}

    def _lrclib(self, path: str, **params):
        url = f"https://lrclib.net/api{path}?{urllib.parse.urlencode(params)}"
        try:
            return self.http_get_json(url, retries=2)
        except Exception:  # noqa: BLE001  (404 = nao achou)
            return None

    def _netease(self, song: dict, title: str, artist: str) -> list[dict]:
        base = "https://music.163.com/api"
        try:
            found = self.http_get_json(f"{base}/search/get?" + urllib.parse.urlencode(
                {"s": f"{artist} {title}", "type": 1, "limit": 8}), retries=1)
        except Exception:  # noqa: BLE001
            return []
        out = []
        for s in ((found or {}).get("result") or {}).get("songs") or []:
            cand = {"source": "NetEase", "title": s.get("name") or "",
                    "artist": ", ".join(a.get("name", "") for a in s.get("artists") or []),
                    "duration": (s.get("duration") or 0) / 1000.0, "id": f"ne{s.get('id')}"}
            if not self._matches(song, cand):
                continue
            try:
                lyr = self.http_get_json(f"{base}/song/lyric?" + urllib.parse.urlencode(
                    {"id": s.get("id"), "lv": 1}), retries=1)
            except Exception:  # noqa: BLE001
                continue
            text = ((lyr or {}).get("lrc") or {}).get("lyric") or ""
            # NetEase poe creditos em linhas "[00:00.00] 作词 : ..." no comeco
            text = "\n".join(l for l in text.splitlines()
                             if not re.search(r"(作词|作曲|编曲|制作人|混音)\s*[:：]", l))
            if parse_lrc(text)["synced"]:
                cand["synced_lrc"] = text
                out.append(cand)
        return out

    def _matches(self, song: dict, cand: dict) -> bool:
        want_t = self.normalize_title(song["title"])
        got_t = self.normalize_title(cand.get("title") or "")
        if not want_t or not got_t:
            return False
        if difflib.SequenceMatcher(None, want_t, got_t).ratio() < 0.85 and want_t not in got_t:
            return False
        mine = set(self.split_artists(song.get("artist") or "")) | set(
            self.split_artists(song.get("album_artist") or ""))
        theirs = set(self.split_artists(cand.get("artist") or ""))
        if mine and theirs and not (mine & theirs) and not any(
                difflib.SequenceMatcher(None, a, b).ratio() > 0.85 for a in mine for b in theirs):
            return False
        dur = song.get("duration") or 0
        return not (dur and cand.get("duration") and abs(cand["duration"] - dur) > 4)

    def candidates(self, song: dict) -> list[dict]:
        title = song["title"] or ""
        clean = re.sub(r"\s*[\(\[](feat|ft|with|part)[^\)\]]*[\)\]]", "", title, flags=re.I).strip()
        artist = song.get("artist") or song.get("album_artist") or ""
        first = re.split(r"\s*(?:•|;|,| feat\.? | ft\.? | & )\s*", artist, flags=re.I)[0]
        dur = int(round(song.get("duration") or 0))
        found: dict[str, dict] = {}

        def add(item):
            if not isinstance(item, dict) or not item.get("id"):
                return
            cand = {"source": "LRCLIB", "id": f"lr{item['id']}", "title": item.get("trackName"),
                    "artist": item.get("artistName"), "duration": item.get("duration") or 0,
                    "synced_lrc": item.get("syncedLyrics") or "", "plain": item.get("plainLyrics") or "",
                    "instrumental": bool(item.get("instrumental"))}
            if self._matches(song, cand):
                found.setdefault(cand["id"], cand)

        add(self._lrclib("/get", artist_name=artist, track_name=title,
                         album_name=song.get("album") or "", duration=dur))
        if first != artist or clean != title:
            add(self._lrclib("/get", artist_name=first, track_name=clean, duration=dur))
        for res in (self._lrclib("/search", track_name=clean, artist_name=first),
                    self._lrclib("/search", q=f"{first} {clean}")):
            for item in (res or [])[:20]:
                add(item)
        if not any(c["synced_lrc"] for c in found.values()):
            for c in self._netease(song, clean, first):
                found.setdefault(c["id"], c)
        return list(found.values())

    def best_lyrics(self, song: dict, exclude: str | None = None, need_synced=False) -> dict | None:
        dur = song.get("duration") or 0
        options = []
        for c in self.candidates(song):
            if c.get("instrumental") and not c.get("synced_lrc") and not c.get("plain"):
                options.append({**c, "lrc": "", "synced": False})
                continue
            if c.get("synced_lrc"):
                lines = parse_lrc(c["synced_lrc"])["lines"]
                # ultima linha depois do fim da faixa = outra versao
                if lines and (not dur or lines[-1][0] / 1000 <= dur + 5):
                    options.append({**c, "lrc": c["synced_lrc"].strip() + "\n", "synced": True})
                    continue
            if c.get("plain") and not need_synced:
                options.append({**c, "lrc": c["plain"].strip() + "\n", "synced": False})
        if exclude:
            options = [o for o in options if o.get("instrumental") or not same_lyrics(o["lrc"], exclude)]
        if not options:
            return None
        for o in options:
            o["diff"] = abs((o.get("duration") or dur) - dur) if dur else 0.0
        lyrics = [o for o in options if not o.get("instrumental")]
        if not lyrics:
            return {**options[0], "instrumental": True}
        lyrics.sort(key=lambda o: (not o["synced"], o["diff"], o["source"] != "LRCLIB"))
        return lyrics[0]

    # ---- audio, tags e capa -------------------------------------------- #

    def _isrc(self, path: Path) -> str | None:
        try:
            import mutagen  # noqa: PLC0415
            tags = mutagen.File(path, easy=True)
            value = (tags or {}).get("isrc") if tags else None
            return value[0].strip().upper() if value else None
        except Exception:  # noqa: BLE001
            return None

    def deezer_track(self, song: dict) -> dict | None:
        path = song.get("file")
        isrc = self._isrc(path) if path and path.exists() else None
        if isrc:
            try:
                return self.deezer.get(f"/track/isrc:{isrc}")
            except Exception:  # noqa: BLE001
                pass
        artist = song.get("artist") or song.get("album_artist") or ""
        try:
            res = self.deezer.get("/search/track", q=f'artist:"{artist}" track:"{song["title"]}"', limit=15)
        except Exception:  # noqa: BLE001
            return None
        dur = song.get("duration") or 0
        best = None
        for t in res.get("data") or []:
            cand = {"title": t.get("title"), "artist": (t.get("artist") or {}).get("name"),
                    "duration": t.get("duration") or 0}
            if not self._matches(song, cand):
                continue
            if best is None or abs(cand["duration"] - dur) < abs(best["duration"] - dur):
                best = t
        if best:
            try:
                return self.deezer.get(f"/track/{best['id']}")
            except Exception:  # noqa: BLE001
                return best
        return None

    def fix_audio(self, user, song, note) -> dict:
        path = song.get("file")
        track = self.deezer_track(song)
        if not track or not path or not path.exists():
            self._save(user, song, "audio", "manual", "faixa nao encontrada no Deezer", note)
            return {"status": "pending"}
        hidden = path.with_name(f".{path.name}.tarsbak")
        try:
            os.replace(path, hidden)
            res = self.deemix.add(f"https://www.deezer.com/track/{track['id']}")
            if isinstance(res, dict) and res.get("result") is False:
                raise RuntimeError(res)
        except Exception as exc:  # noqa: BLE001
            if hidden.exists() and not path.exists():
                os.replace(hidden, path)
            log.warning("Redownload falhou: %s", exc)
            self._save(user, song, "audio", "manual", f"deemix falhou: {exc}"[:300], note)
            return {"status": "pending"}
        self._save(user, song, "audio", "audio_queued", f"baixando de novo: deezer {track['id']}",
                   note, backup=str(hidden))
        return {"status": "queued"}

    def check_audio(self):
        """Confere os audios baixados de novo: novo arquivo -> apaga backup; nada em 6 h -> volta."""
        with self._db() as conn:
            rows = conn.execute("select * from reports where status = 'audio_queued'").fetchall()
        for r in rows:
            hidden = Path(r["backup"] or "")
            original = hidden.with_name(hidden.name[1:-len(".tarsbak")]) if hidden.name else None
            if not original:
                continue
            want = self.normalize_title(r["title"] or "")
            fresh = [p for p in original.parent.iterdir()
                     if p.suffix.lower() in AUDIO_EXT and not p.name.startswith(".")
                     and want and want in self.normalize_title(p.stem)] if original.parent.exists() else []
            if fresh:
                hidden.unlink(missing_ok=True)
                self._update(r["id"], "fixed", f"audio novo: {fresh[0].name}")
                self.request_rescan()
            elif time.time() - r["created_at"] > AUDIO_WAIT:
                if hidden.exists() and not original.exists():
                    os.replace(hidden, original)
                self._update(r["id"], "manual", "deemix nao entregou o audio; original restaurado")

    def fix_tags(self, user, song, note) -> dict:
        path = song.get("file")
        track = self.deezer_track(song)
        if not track or not path or not path.exists():
            self._save(user, song, "tags", "manual", "faixa nao encontrada no Deezer", note)
            return {"status": "pending"}
        try:
            import mutagen  # noqa: PLC0415
            album = track.get("album") or {}
            try:
                full = self.deezer.get(f"/album/{album['id']}") if album.get("id") else {}
            except Exception:  # noqa: BLE001
                full = {}
            contributors = [c.get("name") for c in track.get("contributors") or [] if c.get("name")]
            values = {
                "title": track.get("title"),
                "artist": ", ".join(contributors) or (track.get("artist") or {}).get("name"),
                "album": album.get("title"),
                "albumartist": (full.get("artist") or track.get("artist") or {}).get("name"),
                "date": (full.get("release_date") or track.get("release_date") or "")[:4] or None,
                "tracknumber": str(track["track_position"]) if track.get("track_position") else None,
                "discnumber": str(track["disk_number"]) if track.get("disk_number") else None,
            }
            genres = [g.get("name") for g in (full.get("genres") or {}).get("data") or [] if g.get("name")]
            if genres:
                values["genre"] = genres[0]
            backup = self._backup(path, song["id"]) if path.stat().st_size < 200 * 1024 * 1024 else None
            tmp = Path(tempfile.mkdtemp(prefix="tags-")) / path.name
            try:
                shutil.copyfile(path, tmp)
                tags = mutagen.File(tmp, easy=True)
                if tags is None:
                    raise RuntimeError("formato sem suporte")
                if tags.tags is None:
                    tags.add_tags()
                changed = []
                for key, val in values.items():
                    if not val or [str(val)] == list(tags.get(key) or []):
                        continue
                    try:
                        tags[key] = [str(val)]
                        changed.append(key)
                    except (KeyError, ValueError):
                        pass  # chave que o formato nao aceita
                if changed:
                    tags.save()
                    self._write(path, tmp.read_bytes())
            finally:
                shutil.rmtree(tmp.parent, ignore_errors=True)
        except Exception as exc:  # noqa: BLE001
            log.warning("Tags falharam: %s", exc)
            self._save(user, song, "tags", "manual", f"nao consegui gravar as tags: {exc}"[:300], note)
            return {"status": "pending"}
        if not changed:
            self._save(user, song, "tags", "manual", "tags ja batem com o Deezer", note)
            return {"status": "pending"}
        self._save(user, song, "tags", "fixed", "corrigido: " + ", ".join(changed), note, backup=backup)
        self.request_rescan()
        return {"status": "fixed"}

    def fix_cover(self, user, song, note) -> dict:
        path = song.get("file")
        track = self.deezer_track(song)
        album = (track or {}).get("album") or {}
        cover = album.get("cover_xl") or album.get("cover_big")
        if not cover or not path:
            self._save(user, song, "cover", "manual", "album nao encontrado no Deezer", note)
            return {"status": "pending"}
        # so troca se a pasta guarda um album so (senao a capa vale para os outros)
        folder = path.parent
        prefix = song["path"].rsplit("/", 1)[0] + "/"
        albums = {r["album_id"] for r in self._nd_query(
            "select distinct album_id from media_file where path like ? escape '\\'"
            " and path not like ? escape '\\'",
            (prefix.replace("%", "\\%").replace("_", "\\_") + "%",
             prefix.replace("%", "\\%").replace("_", "\\_") + "%/%"))}
        if len(albums) > 1:
            self._save(user, song, "cover", "manual", "pasta com mais de um album", note)
            return {"status": "pending"}
        try:
            req = urllib.request.Request(cover, headers={"User-Agent": "navidrome-discover/1.0"})
            with urllib.request.urlopen(req, timeout=30) as res:
                data = res.read(10 * 1024 * 1024)
            if not data.startswith(b"\xff\xd8"):
                raise RuntimeError("capa nao e JPEG")
            target = folder / "cover.jpg"
            backup = self._backup(target, song["id"])
            for old in folder.glob("cover.*"):
                if old.name != "cover.jpg":
                    self._backup(old, song["id"])
                    old.unlink()
            self._write(target, data)
        except Exception as exc:  # noqa: BLE001
            self._save(user, song, "cover", "manual", f"falha ao gravar capa: {exc}"[:300], note)
            return {"status": "pending"}
        self._save(user, song, "cover", "fixed", f"capa do Deezer (album {album.get('id')})", note,
                   backup=backup)
        self.request_rescan()
        return {"status": "fixed"}

    # ---- revisao periodica de letras ----------------------------------- #

    def suspicious(self, song: dict, text: str) -> str | None:
        p = parse_lrc(text)
        dur = song.get("duration") or 0
        if p["synced"] and dur and p["lines"][-1][0] / 1000 > dur + 8:
            return "letra mais longa que a faixa"
        length = p["tags"].get("length", "")
        m = re.fullmatch(r"(\d+):(\d{1,2})(?:\.\d+)?", length)
        if m and dur and abs(int(m.group(1)) * 60 + int(m.group(2)) - dur) > 8:
            return "[length:] diferente da faixa"
        ti = p["tags"].get("ti")
        if ti and difflib.SequenceMatcher(None, self.normalize_title(ti),
                                          self.normalize_title(song["title"])).ratio() < 0.5:
            return "[ti:] de outra musica"
        if not p["synced"] and p["plain"]:
            return "sem tempo"
        return None

    def review(self):
        with self._db() as conn:
            row = conn.execute("select v from kv where k = 'review_cursor'").fetchone()
            cursor = row["v"] if row else ""
            done = {r["song_id"] for r in conn.execute(
                "select song_id from reviewed where at > ?", (time.time() - REVIEW_AGAIN_DAYS * 86400,))}
        rows = self._nd_query(
            "select id, path, title, artist, album, album_artist, album_id, duration from media_file"
            " where missing = 0 and id > ? order by id limit ?", (cursor, REVIEW_BATCH))
        if not rows:
            with self._db() as conn:
                conn.execute("insert or replace into kv values ('review_cursor', '')")
            return
        fixed = flagged = 0
        for r in rows:
            song = dict(r)
            if song["id"] in done:
                continue
            song["file"] = self.local_path(song["path"])
            text = self.read_lrc(song)
            reason = self.suspicious(song, text) if text else None
            if reason:
                flagged += 1
                cand = self.best_lyrics(song, exclude=None if reason == "sem tempo" else text,
                                        need_synced=reason == "sem tempo")
                if cand and not cand.get("instrumental") and cand["lrc"]:
                    self._backup(self.lrc_path(song), song["id"])
                    self._write(self.lrc_path(song), cand["lrc"].encode("utf-8"))
                    self._save("auto", song, "lyrics_wrong", "fixed",
                               f"revisao: {reason}; trocada por {cand['source']}")
                    fixed += 1
                elif reason != "sem tempo":
                    self._save("auto", song, "lyrics_wrong", "manual", f"revisao: {reason}")
                time.sleep(1)  # nao martelar o LRCLIB
            with self._db() as conn:
                conn.execute("insert or replace into reviewed values (?, ?)", (song["id"], time.time()))
        with self._db() as conn:
            conn.execute("insert or replace into kv values ('review_cursor', ?)", (rows[-1]["id"],))
        log.info("Revisao de letras: %d faixas, %d suspeitas, %d corrigidas", len(rows), flagged, fixed)
        if fixed:
            self.request_rescan()

    def tick(self):
        """Chamado pelo laco de fundo a cada poucos minutos."""
        try:
            self.check_audio()
        except Exception:  # noqa: BLE001
            log.exception("Conferencia de audio falhou")
        if self.rescan_due and time.time() >= self.rescan_due:
            self.rescan_due = 0.0
            self._rescan()
        with self._db() as conn:
            row = conn.execute("select v from kv where k = 'review_at'").fetchone()
        if not row or time.time() - float(row["v"]) > REVIEW_EVERY:
            with self._db() as conn:
                conn.execute("insert or replace into kv values ('review_at', ?)", (str(time.time()),))
            try:
                self.review()
            except Exception:  # noqa: BLE001
                log.exception("Revisao de letras falhou")

    # ---- admin --------------------------------------------------------- #

    def listing(self, status: str | None = None, limit: int = 200) -> list[dict]:
        sql, params = "select * from reports", []
        if status:
            sql += " where status = ?"
            params.append(status)
        sql += " order by id desc limit ?"
        params.append(limit)
        with self._db() as conn:
            return [dict(r) for r in conn.execute(sql, params)]

    def resolve(self, rid: int) -> bool:
        with self._db() as conn:
            cur = conn.execute("update reports set status = 'resolved', updated_at = ? where id = ?"
                               " and status = 'manual'", (time.time(), rid))
            return cur.rowcount > 0

    def html(self, token: str) -> str:
        import html as h  # noqa: PLC0415
        rows = self.listing()
        manual = [r for r in rows if r["status"] == "manual"]
        def tr(r):
            when = time.strftime("%d/%m %H:%M", time.localtime(r["created_at"]))
            action = (f"<form method=post action='/reports/{r['id']}/resolve?token={h.escape(token)}'>"
                      "<button>resolvido</button></form>") if r["status"] == "manual" else ""
            return (f"<tr class={h.escape(r['status'])}><td>{when}</td><td>{h.escape(r['user'])}</td>"
                    f"<td>{h.escape(r['kind'])}</td><td>{h.escape(r['artist'] or '')} - "
                    f"{h.escape(r['title'] or '')}<br><small>{h.escape(r['song_id'])}</small></td>"
                    f"<td>{h.escape(r['status'])}</td><td>{h.escape(r['result'] or '')}"
                    f"{'<br><i>' + h.escape(r['note']) + '</i>' if r['note'] else ''}</td>"
                    f"<td>{action}</td></tr>")
        return ("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
                "<title>Reportes</title><style>body{font:14px system-ui;background:#121212;color:#eee;"
                "margin:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #333;"
                "padding:6px;text-align:left;vertical-align:top}.manual td{background:#3a2a10}"
                ".fixed td{color:#9c9}small{color:#888}</style>"
                f"<h1>Reportes</h1><p>{len(manual)} para revisar (em laranja). Ultimos 200 abaixo.</p>"
                "<table><tr><th>Quando</th><th>Quem</th><th>Tipo</th><th>Musica</th><th>Estado</th>"
                "<th>Resultado</th><th></th></tr>" + "".join(tr(r) for r in rows) + "</table>")

