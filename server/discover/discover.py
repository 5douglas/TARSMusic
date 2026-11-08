#!/usr/bin/env python3
"""
discover: backend da aba "Descobrir" (fork do Substreamer).

Endpoints (todos exigem token, exceto /health):
  GET  /playlists                      -> indice das playlists disponiveis
  GET  /playlists/new-releases         -> lancamentos recentes de artistas da biblioteca
  GET  /playlists/recommended          -> recomendacoes pelo historico do Navidrome
  GET  /playlists/charts?country=BR    -> Top <pais> / Top Global (Deezer)
  GET  /preview/{track_id}             -> 302 para um preview de 30s valido
  POST /download {"url": "..."}        -> envia para a fila do deemix
  GET  /download/queue                 -> fila do deemix (resumo)
  GET  /auth/info                      -> publico: hashes dos hosts do Navidrome servido
  POST /auth/session                   -> credenciais Subsonic (X-Subsonic-*) -> sessao
  POST /report                         -> reportar problema numa musica (ver reports.py)
  GET  /reports/view                   -> lista de reportes para o admin (so DISCOVER_TOKEN)
  GET  /                               -> pagina HTML de teste

Somente biblioteca padrao do Python (3.11+).
"""

import base64
import hashlib
import hmac
import http.cookiejar
import json
import logging
import os
import random
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import reports as reports_mod

log = logging.getLogger("discover")

DEEZER_API = "https://api.deezer.com"
USER_AGENT = "navidrome-discover/1.0"

TOKEN = os.environ["DISCOVER_TOKEN"]
# Login com a conta do Navidrome: o app manda as credenciais Subsonic do usuario, o
# Navidrome confere (ping.view) e o discover devolve uma sessao assinada com um segredo
# derivado do DISCOVER_TOKEN (trocar o token derruba todas as sessoes).
NAVIDROME_URL = os.environ.get("NAVIDROME_URL", "http://navidrome:4533").rstrip("/")
# hosts publicos do Navidrome (sem esquema); o app so manda credenciais se o servidor
# dele estiver nesta lista. Publicados apenas como SHA-256.
NAVIDROME_PUBLIC_HOSTS = [h.strip().lower() for h in
                          os.environ.get("NAVIDROME_PUBLIC_HOSTS", "music.douglas.seg.br").split(",")
                          if h.strip()]
SESSION_TTL = int(os.environ.get("SESSION_TTL_HOURS", "24")) * 3600
SESSION_KEY = hmac.new(TOKEN.encode(), b"discover-session-v1", hashlib.sha256).digest()
DEEMIX_URL = os.environ.get("DEEMIX_URL", "http://deemix:6595").rstrip("/")
DEEMIX_ARL = os.environ.get("DEEMIX_ARL", "")
ND_DB = Path(os.environ.get("NAVIDROME_DB", "/navidrome/navidrome.db"))
AUTODL_STATE = Path(os.environ.get("AUTODL_STATE", "/autodl/state.json"))
CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/data"))
# usuarios do Navidrome cujo historico alimenta as recomendacoes ("" = todos)
HISTORY_USERS = [u.strip() for u in os.environ.get("HISTORY_USERS", "").split(",") if u.strip()]
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "30"))
PLAYLIST_TTL = int(os.environ.get("PLAYLIST_TTL", "2400"))      # previews do Deezer expiram em ~1h
SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL_HOURS", "12")) * 3600
IGNORE_ARTISTS = {"various artists", "varios artistas"}
SKIP_TITLES = re.compile(r"karaoke|instrumental version|sped up|slowed", re.I)

# Top <pais> do perfil "Deezer Charts" (user 637006841); o resto e buscado por nome
CHART_PLAYLISTS = {"BR": 1111141961, "GLOBAL": 3155776842}
COUNTRY_NAMES = {
    "AR": "Argentina", "AU": "Australia", "AT": "Austria", "BE": "Belgium", "CA": "Canada",
    "CL": "Chile", "CO": "Colombia", "DE": "Germany", "DK": "Denmark", "ES": "Spain",
    "FR": "France", "GB": "UK", "IT": "Italy", "JP": "Japan", "MX": "Mexico", "NL": "Netherlands",
    "PT": "Portugal", "US": "USA",
}


# --------------------------------------------------------------------------- #
# Utilidades (mesma normalizacao do navidrome-autodl)
# --------------------------------------------------------------------------- #

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_title(title: str) -> str:
    title = re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", title or "")
    title = re.sub(r"\s+-\s+(single|ep)$", "", title, flags=re.I)
    title = re.sub(r"\s+-\s+.*(remaster|version|ao vivo|live).*$", "", title, flags=re.I)
    return normalize(title)


def split_artists(name: str) -> list[str]:
    parts = re.split(r"\s*(?:•|;|/|,| feat\.? | ft\.? | x | & | e )\s*", name or "", flags=re.I)
    return [normalize(p) for p in parts if p.strip()]


def http_get_json(url: str, retries: int = 3):
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            if attempt == retries:
                raise
            time.sleep(2 * attempt)


# --------------------------------------------------------------------------- #
# Deezer
# --------------------------------------------------------------------------- #

class Deezer:
    """Cliente da API publica, com limite global (~50 req / 5s)."""

    def __init__(self, delay: float = 0.12):
        self.delay = delay
        self.lock = threading.Lock()
        self.last = 0.0

    def get(self, path: str, **params):
        url = f"{DEEZER_API}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        for _ in range(5):
            with self.lock:
                wait = self.last + self.delay - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                self.last = time.monotonic()
            data = http_get_json(url)
            err = data.get("error") if isinstance(data, dict) else None
            if err and err.get("code") == 4:
                time.sleep(5)
                continue
            if err and err.get("code") == 800:  # objeto nao existe
                raise LookupError(f"Deezer {path}: nao encontrado")
            if err:
                raise RuntimeError(f"Deezer {path}: {err}")
            return data
        raise RuntimeError(f"Deezer {path}: limite de requisicoes excedido")

    def find_artist(self, name: str) -> dict | None:
        data = self.get("/search/artist", q=name, limit=25)
        wanted = normalize(name)
        matches = [a for a in data.get("data", []) if normalize(a.get("name", "")) == wanted]
        return max(matches, key=lambda a: a.get("nb_fan", 0)) if matches else None


deezer = Deezer()


# --------------------------------------------------------------------------- #
# Biblioteca do Navidrome (copia read-only do SQLite)
# --------------------------------------------------------------------------- #

class Library:
    """Le o banco do Navidrome a partir de uma copia (db + wal), nunca escreve no original."""

    def __init__(self, path: Path, ttl: int = 600):
        self.path = path
        self.ttl = ttl
        self.lock = threading.Lock()
        self.loaded = 0.0
        self.tracks: set[tuple[str, str]] = set()     # (artista, titulo) normalizados
        self.albums: set[tuple[str, str]] = set()     # (artista, album) normalizados
        self.artists: dict[str, str] = {}             # normalizado -> nome original
        self.history: list[dict] = []                 # artistas mais ouvidos
        self.track_counts: dict[str, int] = {}        # artista normalizado -> faixas na biblioteca

    def refresh(self, force: bool = False):
        with self.lock:
            if not force and time.time() - self.loaded < self.ttl:
                return
            tmp = Path(tempfile.mkdtemp(prefix="nd-"))
            try:
                for suffix in ("", "-wal"):
                    src = Path(str(self.path) + suffix)
                    if src.exists():
                        shutil.copyfile(src, tmp / f"navidrome.db{suffix}")
                conn = sqlite3.connect(tmp / "navidrome.db")
                try:
                    conn.execute("pragma query_only = 1")
                    self._load(conn)
                finally:
                    conn.close()
            finally:
                shutil.rmtree(tmp, ignore_errors=True)
            self.loaded = time.time()
            log.info("Biblioteca: %d faixas, %d albuns, %d artistas, %d artistas no historico",
                     len(self.tracks), len(self.albums), len(self.artists), len(self.history))

    def _load(self, conn: sqlite3.Connection):
        tracks, albums, artists, counts = set(), set(), {}, {}
        for title, album, artist, album_artist in conn.execute(
                "select title, album, artist, album_artist from media_file where missing = 0"):
            t, a = normalize_title(title), normalize_title(album)
            parts = {p for name in {artist, album_artist} for p in split_artists(name)}
            for part in parts:
                tracks.add((part, t))
                albums.add((part, a))
                counts[part] = counts.get(part, 0) + 1
            for name in {artist, album_artist}:
                if name:
                    artists.setdefault(normalize(name), name)
        for (name,) in conn.execute("select name from artist where missing = 0"):
            artists.setdefault(normalize(name), name)
        self.tracks, self.albums, self.artists, self.track_counts = tracks, albums, artists, counts

        # historico: scrobbles recentes pesam mais; annotation completa o resto
        users = ""
        params: list = []
        if HISTORY_USERS:
            users = f" and u.user_name in ({','.join('?' * len(HISTORY_USERS))})"
            params = list(HISTORY_USERS)
        since = int((datetime.now(timezone.utc) - timedelta(days=60)).timestamp())
        score: dict[str, float] = {}
        names: dict[str, str] = {}
        rows = conn.execute(
            "select m.artist, m.album_artist, count(*) from scrobbles s"
            " join media_file m on m.id = s.media_file_id join user u on u.id = s.user_id"
            f" where s.submission_time >= ?{users} group by 1, 2", [since, *params])
        for artist, album_artist, n in rows:
            for name in (artist or album_artist or "").split(" • ")[:1]:
                key = normalize(name)
                score[key] = score.get(key, 0) + 2 * n
                names.setdefault(key, name.strip())
        rows = conn.execute(
            "select ar.name, a.play_count from annotation a join artist ar on ar.id = a.item_id"
            f" join user u on u.id = a.user_id where a.item_type = 'artist' and a.play_count > 0{users}",
            params)
        for name, n in rows:
            key = normalize(name)
            score[key] = score.get(key, 0) + n
            names.setdefault(key, name)
        ranked = sorted(score.items(), key=lambda kv: kv[1], reverse=True)
        self.history = [{"name": names[k], "score": s} for k, s in ranked
                        if k and k not in IGNORE_ARTISTS]

    def has_track(self, artist: str, title: str) -> bool:
        t = normalize_title(title)
        return any((a, t) in self.tracks for a in split_artists(artist))

    def has_album(self, artist: str, title: str) -> bool:
        t = normalize_title(title)
        return any((a, t) in self.albums for a in split_artists(artist))

    def has_artist(self, artist: str) -> bool:
        return normalize(artist) in self.artists


library = Library(ND_DB)


# --------------------------------------------------------------------------- #
# Cache de IDs de artistas do Deezer (reaproveita o state.json do autodl)
# --------------------------------------------------------------------------- #

class ArtistIds:
    def __init__(self):
        self.lock = threading.Lock()
        self.own_path = CACHE_DIR / "artist_ids.json"
        self.own: dict = json.loads(self.own_path.read_text()) if self.own_path.exists() else {}

    def _autodl(self) -> dict:
        try:
            return json.loads(AUTODL_STATE.read_text(encoding="utf-8")).get("artists", {})
        except Exception:  # noqa: BLE001
            return {}

    def lookup(self, name: str, autodl: dict | None = None) -> int | None:
        autodl = autodl if autodl is not None else self._autodl()
        cached = autodl.get(name) or self.own.get(name)
        if cached and cached.get("deezer_id"):
            return cached["deezer_id"]
        if cached and (date.today() - date.fromisoformat(cached["checked"])).days < 7:
            return None
        found = deezer.find_artist(name)
        with self.lock:
            self.own[name] = {"deezer_id": found["id"] if found else None,
                              "checked": date.today().isoformat()}
            self.own_path.write_text(json.dumps(self.own, ensure_ascii=False))
        return found["id"] if found else None


artist_ids = ArtistIds()


# --------------------------------------------------------------------------- #
# Montagem das playlists
# --------------------------------------------------------------------------- #

def track_item(t: dict, album: dict | None = None) -> dict:
    album = album or t.get("album") or {}
    artist = (t.get("artist") or {}).get("name", "")
    return {
        "id": t["id"],
        "type": "track",
        "title": t.get("title", ""),
        "artist": artist,
        "artist_id": (t.get("artist") or {}).get("id"),
        "album": album.get("title", ""),
        "album_id": album.get("id"),
        "cover": album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium"),
        "cover_small": album.get("cover_medium") or album.get("cover_small"),
        "preview": t.get("preview") or None,
        "duration": t.get("duration", 0),
        "explicit": bool(t.get("explicit_lyrics")),
        "link": t.get("link") or f"https://www.deezer.com/track/{t['id']}",
        "album_link": f"https://www.deezer.com/album/{album['id']}" if album.get("id") else None,
        "in_library": library.has_track(artist, t.get("title", "")),
    }


def playlist(pid: str, title: str, description: str, items: list[dict], **extra) -> dict:
    return {"id": pid, "title": title, "description": description,
            "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "count": len(items), **extra, "items": items}


class ReleaseScanner:
    """Varre (em segundo plano) os lancamentos recentes de todos os artistas da biblioteca."""

    def __init__(self):
        self.path = CACHE_DIR / "releases.json"
        self.data = json.loads(self.path.read_text()) if self.path.exists() else {"scanned": None, "albums": []}
        self.running = False

    def due(self) -> bool:
        if not self.data.get("scanned"):
            return True
        age = time.time() - datetime.fromisoformat(self.data["scanned"]).timestamp()
        return age > SCAN_INTERVAL

    def scan(self):
        self.running = True
        try:
            library.refresh()
            autodl = artist_ids._autodl()
            since = date.today() - timedelta(days=LOOKBACK_DAYS)
            found: dict[int, dict] = {}
            # artistas que o autodl ja casou com o Deezer (evita milhares de buscas)
            names = sorted(n for n, v in autodl.items() if v.get("deezer_id"))
            log.info("Varredura de lancamentos: %d artistas desde %s", len(names), since)
            for i, name in enumerate(names, 1):
                if normalize(name) in IGNORE_ARTISTS:
                    continue
                try:
                    aid = autodl[name]["deezer_id"]
                    data = deezer.get(f"/artist/{aid}/albums", limit=25)
                    for alb in data.get("data", []):
                        try:
                            rel = date.fromisoformat(alb.get("release_date", ""))
                        except ValueError:
                            continue
                        if since <= rel <= date.today() and not SKIP_TITLES.search(alb["title"]):
                            found[alb["id"]] = {"id": alb["id"], "title": alb["title"], "artist": name,
                                                "artist_id": aid, "release_date": alb["release_date"],
                                                "record_type": alb.get("record_type")}
                except Exception as exc:  # noqa: BLE001
                    log.warning("Lancamentos de %s: %s", name, exc)
                if i % 200 == 0:
                    log.info("  %d/%d artistas...", i, len(names))
            albums = sorted(found.values(), key=lambda a: a["release_date"], reverse=True)
            self.data = {"scanned": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                         "albums": albums}
            self.path.write_text(json.dumps(self.data, ensure_ascii=False))
            log.info("Varredura concluida: %d lancamentos", len(albums))
        finally:
            self.running = False


scanner = ReleaseScanner()


def release_candidates(min_tracks: int = 3, per_artist: int = 2) -> list[dict]:
    """Lancamentos da varredura que valem mostrar: artistas que voce ouve primeiro, depois por data."""
    heard = {normalize(h["name"]) for h in library.history}
    candidates, seen, per = [], set(), {}
    for alb in scanner.data.get("albums", []):  # do mais novo pro mais velho
        artist = normalize(alb["artist"])
        key = (artist, normalize_title(alb["title"]))
        if key in seen or alb.get("record_type") not in ("album", "ep", "single"):
            continue  # versao explicita/limpa do mesmo lancamento
        # ignora artistas com quase nada na biblioteca (participacoes, nomes casados errado)
        if artist not in heard and library.track_counts.get(artist, 0) < min_tracks:
            continue
        if per.get(artist, 0) >= per_artist:
            continue
        seen.add(key)
        per[artist] = per.get(artist, 0) + 1
        candidates.append(alb)
    # artistas que voce ouve primeiro, depois o resto; ambos por data
    candidates.sort(key=lambda a: normalize(a["artist"]) not in heard)
    return candidates


def build_new_releases(limit: int = 60) -> dict:
    library.refresh()
    items, seen_tracks = [], set()
    for alb in release_candidates():
        if len(items) >= limit:
            break
        try:
            full = deezer.get(f"/album/{alb['id']}")
        except Exception as exc:  # noqa: BLE001
            log.warning("Album %s: %s", alb["id"], exc)
            continue
        album_in_lib = library.has_album(alb["artist"], alb["title"])
        tracks = full.get("tracks", {}).get("data", [])
        # singles/EPs entram inteiros; de albuns, as 3 primeiras faixas
        for t in tracks[: (3 if full.get("record_type") == "album" else 6)]:
            item = track_item(t, full)
            tkey = (normalize(item["artist"]), normalize(item["title"]))
            if tkey in seen_tracks:
                continue  # mesma faixa em single + EP, ou versao explicita/limpa
            seen_tracks.add(tkey)
            item["release_date"] = full.get("release_date")
            item["record_type"] = full.get("record_type")
            item["album_in_library"] = album_in_lib
            items.append(item)
    return playlist("new-releases", "Lancamentos", f"Novidades dos ultimos {LOOKBACK_DAYS} dias "
                    "de artistas da sua biblioteca", items, scanned=scanner.data.get("scanned"),
                    scanning=scanner.running)


def build_recommended(limit: int = 60, seeds: int = 12) -> dict:
    library.refresh()
    autodl = artist_ids._autodl()
    seed_list = []
    for entry in library.history:
        if len(seed_list) >= seeds:
            break
        try:
            aid = artist_ids.lookup(entry["name"], autodl)
        except Exception:  # noqa: BLE001
            aid = None
        if aid:
            seed_list.append((entry["name"], aid))

    radio_pool, related_pool = [], []
    for name, aid in seed_list:
        try:
            for t in deezer.get(f"/artist/{aid}/radio", limit=25).get("data", []):
                radio_pool.append((name, t))
        except Exception as exc:  # noqa: BLE001
            log.warning("Radio %s: %s", name, exc)
        try:
            related = deezer.get(f"/artist/{aid}/related", limit=10).get("data", [])
            # artistas relacionados que ainda nao estao na biblioteca = descoberta de verdade
            fresh = [r for r in related if not library.has_artist(r["name"])][:3]
            for r in fresh:
                for t in deezer.get(f"/artist/{r['id']}/top", limit=2).get("data", []):
                    related_pool.append((name, t))
        except Exception as exc:  # noqa: BLE001
            log.warning("Relacionados %s: %s", name, exc)

    random.seed(date.today().isoformat())  # mistura estavel durante o dia
    random.shuffle(radio_pool)
    random.shuffle(related_pool)
    items, seen = [], set()
    for pool in _interleave(related_pool, radio_pool):
        seed, t = pool
        item = track_item(t)
        key = (normalize(item["artist"]), normalize_title(item["title"]))
        if item["in_library"] or key in seen or t["id"] in seen:
            continue
        seen.update({key, t["id"]})
        item["reason"] = f"Porque voce ouve {seed}"
        items.append(item)
        if len(items) >= limit:
            break
    return playlist("recommended", "Recomendadas para voce",
                    "Radio e artistas relacionados aos que voce mais ouve (fora da biblioteca)",
                    items, seeds=[n for n, _ in seed_list])


def history_seeds(count: int) -> list[tuple[str, int]]:
    """Os `count` artistas mais ouvidos que existem no Deezer: [(nome, deezer_id)]."""
    autodl = artist_ids._autodl()
    seeds = []
    for entry in library.history:
        if len(seeds) >= count:
            break
        try:
            aid = artist_ids.lookup(entry["name"], autodl)
        except Exception:  # noqa: BLE001
            aid = None
        if aid:
            seeds.append((entry["name"], aid))
    return seeds


def build_mix(artist_id: int, limit: int = 40) -> dict:
    """Mix de um artista: radio dele + faixas top de relacionados fora da biblioteca."""
    library.refresh()
    a = deezer.get(f"/artist/{artist_id}")
    name = a.get("name", "")
    pool = list(deezer.get(f"/artist/{artist_id}/radio", limit=40).get("data", []))
    try:
        related = deezer.get(f"/artist/{artist_id}/related", limit=12).get("data", [])
        for r in [r for r in related if not library.has_artist(r["name"])][:5]:
            pool.extend(deezer.get(f"/artist/{r['id']}/top", limit=3).get("data", []))
    except Exception as exc:  # noqa: BLE001
        log.warning("Relacionados %s: %s", name, exc)
    random.Random(f"{date.today()}-{artist_id}").shuffle(pool)  # estavel durante o dia
    items, seen = [], set()
    for t in pool:
        item = track_item(t)
        key = (normalize(item["artist"]), normalize_title(item["title"]))
        if item["in_library"] or key in seen:
            continue
        seen.add(key)
        items.append(item)
        if len(items) >= limit:
            break
    return playlist(f"mix-{artist_id}", f"Mix {name}", f"Parecido com {name}, fora da sua biblioteca",
                    items, type="mix", cover=a.get("picture_xl"), link=a.get("link"))


def artist_missing(name: str, limit: int = 30) -> dict:
    """Albuns de um artista da biblioteca (pelo nome) que faltam na biblioteca, mais novos primeiro."""
    library.refresh()
    aid = artist_ids.lookup(name)
    if not aid:
        raise LookupError(f"Artista nao encontrado no Deezer: {name}")
    a = deezer.get(f"/artist/{aid}")
    albums = deezer.get(f"/artist/{aid}/albums", limit=100).get("data", [])
    albums.sort(key=lambda x: x.get("release_date", ""), reverse=True)
    owner = {"id": aid, "name": a.get("name", name)}
    missing, seen = [], set()
    for x in albums:
        item = album_item(x, owner)
        key = normalize_title(item["title"])
        # o Deezer lista versoes explicita/limpa e reedicoes; mostra cada titulo uma vez
        if item["in_library"] or key in seen or library.has_album(name, x.get("title", "")):
            continue
        seen.add(key)
        missing.append(item)
        if len(missing) >= limit:
            break
    return {"artist": artist_item(a), "count": len(missing), "items": missing}


def build_home(releases: int = 20, mixes: int = 8) -> dict:
    """Secoes da aba Descobrir: cards de lancamentos, mixes e charts."""
    library.refresh()
    release_cards = []
    for alb in release_candidates()[:releases]:
        try:
            release_cards.append(album_item(deezer.get(f"/album/{alb['id']}")))
        except Exception as exc:  # noqa: BLE001
            log.warning("Album %s: %s", alb["id"], exc)
    mix_cards = []
    for name, aid in history_seeds(mixes):
        try:
            pic = deezer.get(f"/artist/{aid}").get("picture_xl")
        except Exception:  # noqa: BLE001
            pic = None
        mix_cards.append({"id": f"mix-{aid}", "type": "mix", "title": f"Mix {name}", "artist": name,
                          "subtitle": f"Parecido com {name}", "cover": pic, "cover_small": pic,
                          "path": f"/playlists/mix/{aid}"})
    chart_cards = []
    for country, title in (("BR", "Top Brasil"), ("GLOBAL", "Top Global")):
        try:
            chart = cache.get(f"chart-{country}", lambda c=country: build_charts(c), ttl=1800)
            chart_cards.append({"id": chart["id"], "type": "chart", "title": title, "count": chart["count"],
                                "subtitle": f"{chart['count']} faixas", "cover": chart.get("cover"),
                                "cover_small": chart.get("cover"),
                                "path": f"/playlists/charts?country={country}"})
        except Exception as exc:  # noqa: BLE001
            log.warning("Chart %s: %s", country, exc)
    return {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scanning": scanner.running,
        "sections": [
            {"id": "releases", "title": "Lancamentos", "items": release_cards},
            {"id": "mixes", "title": "Mixes para voce", "items": mix_cards},
            {"id": "charts", "title": "Charts", "items": chart_cards},
        ],
    }


def _interleave(a: list, b: list):
    for i in range(max(len(a), len(b))):
        if i < len(a):
            yield a[i]
        if i < len(b):
            yield b[i]


def chart_playlist_id(country: str) -> int | None:
    if country in CHART_PLAYLISTS:
        return CHART_PLAYLISTS[country]
    name = COUNTRY_NAMES.get(country)
    if not name:
        return None
    data = deezer.get("/user/637006841/playlists", limit=200)
    for p in data.get("data", []):
        if p["title"].lower() == f"top {name}".lower():
            CHART_PLAYLISTS[country] = p["id"]
            return p["id"]
    return None


def build_charts(country: str = "BR", limit: int = 100) -> dict:
    library.refresh()
    country = (country or "BR").upper()
    if country == "API":
        # /chart da API publica: ranking do pais de onde o servidor acessa (BR)
        data = deezer.get("/chart/0/tracks", limit=limit)
        items = [track_item(t) for t in data.get("data", [])]
        for i, it in enumerate(items, 1):
            it["position"] = i
        return playlist("charts-api", "Deezer Chart", "Ranking geral do Deezer (/chart)", items,
                        country=country)
    pid = chart_playlist_id(country)
    if not pid:
        raise LookupError(f"Sem playlist Top para o pais {country}")
    data = deezer.get(f"/playlist/{pid}")
    items = [track_item(t) for t in data.get("tracks", {}).get("data", [])[:limit]]
    for i, it in enumerate(items, 1):
        it["position"] = i
    return playlist(f"charts-{country.lower()}", data.get("title", f"Top {country}"),
                    data.get("description") or "Playlist editorial do Deezer", items,
                    country=country, cover=data.get("picture_xl"), deezer_playlist_id=pid,
                    link=data.get("link"))


# --------------------------------------------------------------------------- #
# Busca e navegacao (artista / album)
# --------------------------------------------------------------------------- #

def album_item(a: dict, artist: dict | None = None) -> dict:
    artist = artist or a.get("artist") or {}
    return {
        "id": a["id"],
        "type": "album",
        "title": a.get("title", ""),
        "artist": artist.get("name", ""),
        "artist_id": artist.get("id"),
        "cover": a.get("cover_xl") or a.get("cover_big") or a.get("cover_medium"),
        "cover_small": a.get("cover_medium") or a.get("cover_small"),
        "record_type": a.get("record_type"),
        "release_date": a.get("release_date"),
        "track_count": a.get("nb_tracks"),
        "explicit": bool(a.get("explicit_lyrics")),
        "link": a.get("link") or f"https://www.deezer.com/album/{a['id']}",
        "in_library": library.has_album(artist.get("name", ""), a.get("title", "")),
    }


def artist_item(a: dict) -> dict:
    return {
        "id": a["id"],
        "type": "artist",
        "title": a.get("name", ""),
        "cover": a.get("picture_xl") or a.get("picture_big") or a.get("picture_medium"),
        "cover_small": a.get("picture_medium") or a.get("picture_small"),
        "fans": a.get("nb_fan"),
        "album_count": a.get("nb_album"),
        "link": a.get("link") or f"https://www.deezer.com/artist/{a['id']}",
        "in_library": library.has_artist(a.get("name", "")),
    }


SEARCH_TYPES = {"track": "/search/track", "album": "/search/album", "artist": "/search/artist"}


def search(q: str, kind: str = "track", limit: int = 30) -> dict:
    library.refresh()
    data = deezer.get(SEARCH_TYPES[kind], q=q, limit=limit)
    make = {"track": track_item, "album": album_item, "artist": artist_item}[kind]
    items = [make(x) for x in data.get("data", [])]
    return {"query": q, "type": kind, "count": len(items), "items": items}


def browse_album(album_id: int) -> dict:
    library.refresh()
    a = deezer.get(f"/album/{album_id}")
    items = [track_item(t, a) for t in a.get("tracks", {}).get("data", [])]
    return playlist(f"album-{album_id}", a.get("title", ""), a.get("artist", {}).get("name", ""), items,
                    type="album", album=album_item(a), cover=a.get("cover_xl"), link=a.get("link"))


def browse_artist(artist_id: int) -> dict:
    library.refresh()
    a = deezer.get(f"/artist/{artist_id}")
    top = deezer.get(f"/artist/{artist_id}/top", limit=20).get("data", [])
    albums = deezer.get(f"/artist/{artist_id}/albums", limit=100).get("data", [])
    albums.sort(key=lambda x: x.get("release_date", ""), reverse=True)
    return playlist(f"artist-{artist_id}", a.get("name", ""), f"{a.get('nb_fan', 0)} fans",
                    [track_item(t) for t in top], type="artist", artist=artist_item(a),
                    cover=a.get("picture_xl"), link=a.get("link"),
                    albums=[album_item(x, {"id": a["id"], "name": a.get("name", "")}) for x in albums])


class Cache:
    def __init__(self):
        self.lock = threading.Lock()
        self.items: dict[str, tuple[float, dict]] = {}
        self.building: dict[str, threading.Lock] = {}

    def get(self, key: str, builder, ttl: int = PLAYLIST_TTL, refresh: bool = False) -> dict:
        with self.lock:
            hit = self.items.get(key)
            lock = self.building.setdefault(key, threading.Lock())
        if hit and not refresh and time.time() - hit[0] < ttl:
            return hit[1]
        with lock:  # um build por vez para cada playlist
            hit = self.items.get(key)
            if hit and not refresh and time.time() - hit[0] < ttl:
                return hit[1]
            value = builder()
            with self.lock:
                self.items[key] = (time.time(), value)
                if len(self.items) > 300:  # buscas geram muitas chaves; descarta as mais antigas
                    for old in sorted(self.items, key=lambda k: self.items[k][0])[:100]:
                        self.items.pop(old, None)
            return value


cache = Cache()


# --------------------------------------------------------------------------- #
# Deemix
# --------------------------------------------------------------------------- #

DEEZER_URL = re.compile(
    r"^https?://(www\.)?(deezer\.com/([a-z]{2}(-[a-z]{2})?/)?(track|album|playlist|artist)/\d+"
    r"|deezer\.page\.link/\w+|link\.deezer\.com/s/\w+)", re.I)


class Deemix:
    def __init__(self, base: str, arl: str):
        self.base = base
        self.arl = arl
        self.lock = threading.Lock()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.logged_in = False

    def _call(self, path: str, payload: dict | None = None):
        req = urllib.request.Request(
            f"{self.base}/api/{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
            method="POST" if payload is not None else "GET")
        with self.opener.open(req, timeout=60) as resp:
            body = resp.read().decode("utf-8") or "{}"
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return body

    def login(self):
        res = self._call("loginArl", {"arl": self.arl, "force": True, "child": 0})
        status = res.get("status") if isinstance(res, dict) else None
        if status not in (1, 2, 3):
            raise RuntimeError("Falha no login do deemix (ARL invalido?)")
        self.logged_in = True

    def add(self, url: str):
        with self.lock:
            if not self.logged_in:
                self.login()
            res = self._call("addToQueue", {"url": url, "bitrate": None})
            if isinstance(res, dict) and res.get("errid") == "NotLoggedIn":
                self.login()
                res = self._call("addToQueue", {"url": url, "bitrate": None})
            return res

    def action(self, path: str, payload: dict | None = None):
        """Chama uma rota de controle da fila (removeFromQueue, retryDownload, ...)."""
        with self.lock:
            if not self.logged_in:
                self.login()
            return self._call(path, payload if payload is not None else {})

    def queue(self, recent: int = 30, per_group: int = 50):
        with self.lock:
            if not self.logged_in:
                self.login()
            res = self._call("getQueue")
        queue = res.get("queue", {}) if isinstance(res, dict) else {}
        order = res.get("queueOrder", []) if isinstance(res, dict) else []
        rank = {u: i for i, u in enumerate(order)}

        def item(k, v):
            return {"uuid": k, "title": v.get("title"), "artist": v.get("artist"),
                    "type": v.get("type"), "status": v.get("status"), "cover": v.get("cover"),
                    "progress": v.get("progress") or 0, "downloaded": v.get("downloaded") or 0,
                    "failed": v.get("failed") or 0, "size": v.get("size") or 0}

        groups = {"active": [], "queued": [], "failed": [], "completed": []}
        for k, v in queue.items():
            status = v.get("status")
            if status == "downloading":
                groups["active"].append(item(k, v))
            elif status == "inQueue":
                groups["queued"].append(item(k, v))
            elif status in ("failed", "withErrors"):
                groups["failed"].append(item(k, v))
            elif status == "completed":
                groups["completed"].append(item(k, v))
        groups["queued"].sort(key=lambda i: rank.get(i["uuid"], len(rank)))
        # o deemix guarda os itens na ordem em que entraram: os ultimos sao os mais recentes
        groups["failed"].reverse()
        groups["completed"].reverse()
        return {
            "counts": {g: len(v) for g, v in groups.items()},
            "active": groups["active"],
            "queued": groups["queued"][:per_group],
            "failed": groups["failed"][:per_group],
            "completed": groups["completed"][:recent],
        }


deemix = Deemix(DEEMIX_URL, DEEMIX_ARL)

# rota do discover -> (rota do deemix-gui, precisa de uuid)
QUEUE_ACTIONS = {
    "/download/remove": ("removeFromQueue", True),
    "/download/retry": ("retryDownload", True),
    "/download/clear-finished": ("removeFinishedDownloads", False),
    "/download/cancel-all": ("cancelAllDownloads", False),
}


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

# --------------------------------------------------------------------------- #
# Sessoes por usuario do Navidrome
# --------------------------------------------------------------------------- #

def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_session(user: str) -> tuple[str, int]:
    expires = int(time.time()) + SESSION_TTL
    body = f"s1.{_b64(user.encode())}.{expires}"
    sig = _b64(hmac.new(SESSION_KEY, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}", expires


def session_user(token: str) -> str | None:
    """Usuario de uma sessao valida e nao expirada; None caso contrario."""
    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "s1":
        return None
    body = ".".join(parts[:3])
    expected = _b64(hmac.new(SESSION_KEY, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected.encode(), parts[3].encode()):
        return None
    try:
        if int(parts[2]) < time.time():
            return None
        return _unb64(parts[1]).decode()
    except (ValueError, UnicodeDecodeError):
        return None


def navidrome_accepts(user: str, token: str, salt: str, password: str) -> bool:
    params = {"u": user, "v": "1.16.1", "c": "tarsmusic-discover", "f": "json"}
    if token and salt:
        params.update(t=token, s=salt)
    elif password:
        params["p"] = password
    else:
        return False
    try:
        req = urllib.request.Request(f"{NAVIDROME_URL}/rest/ping.view?{urllib.parse.urlencode(params)}",
                                     headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as res:
            body = json.loads(res.read().decode("utf-8"))
    except (OSError, ValueError):
        log.warning("Navidrome indisponivel para conferir login")
        raise
    return body.get("subsonic-response", {}).get("status") == "ok"


class LoginLimiter:
    """Freia tentativa de senha: no maximo `limit` falhas por IP a cada `window` segundos."""

    def __init__(self, limit: int = 10, window: int = 600):
        self.limit, self.window = limit, window
        self.fails: dict[str, list[float]] = {}
        self.lock = threading.Lock()

    def blocked(self, ip: str) -> bool:
        now = time.time()
        with self.lock:
            recent = [t for t in self.fails.get(ip, []) if now - t < self.window]
            self.fails[ip] = recent
            return len(recent) >= self.limit

    def failed(self, ip: str):
        with self.lock:
            if len(self.fails) > 10000:
                self.fails.clear()
            self.fails.setdefault(ip, []).append(time.time())


login_limiter = LoginLimiter()

reports = reports_mod.Reports(
    db_path=CACHE_DIR / "reports.db", nd_db=ND_DB,
    music_dir=Path(os.environ.get("MUSIC_DIR", "/music")),
    nd_music_dir=os.environ.get("ND_MUSIC_DIR", "/music"),
    backup_dir=CACHE_DIR / "backup", deezer=deezer, deemix=deemix, http_get_json=http_get_json,
    normalize=normalize, normalize_title=normalize_title, split_artists=split_artists,
    navidrome_url=NAVIDROME_URL, nd_user=os.environ.get("ND_ADMIN_USER", ""),
    nd_password=os.environ.get("ND_ADMIN_PASSWORD", ""))
HOST_HASHES = [hashlib.sha256(h.encode()).hexdigest() for h in NAVIDROME_PUBLIC_HOSTS]


PAGE = (Path(__file__).parent / "index.html").read_text(encoding="utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "discover/1.0"

    def log_message(self, fmt, *args):
        log.info("%s %s", self.address_string(), re.sub(r"token=[^&\s]+", "token=***", fmt % args))

    def _send(self, status: int, body, content_type="application/json; charset=utf-8", headers=None):
        raw = body if isinstance(body, bytes) else (
            body.encode() if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode())
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self, query: dict) -> bool:
        """Token do admin (DISCOVER_TOKEN) ou sessao emitida por /auth/session."""
        auth = self.headers.get("Authorization", "")
        given = auth[7:] if auth.lower().startswith("bearer ") else (query.get("token") or [""])[0]
        if hmac.compare_digest(given.encode(), TOKEN.encode()):
            return True
        return session_user(given) is not None

    def _is_admin(self, query: dict) -> bool:
        auth = self.headers.get("Authorization", "")
        given = auth[7:] if auth.lower().startswith("bearer ") else (query.get("token") or [""])[0]
        return hmac.compare_digest(given.encode(), TOKEN.encode())

    def _user(self, query: dict) -> str:
        """Usuario do Navidrome da sessao, ou "admin" para o DISCOVER_TOKEN."""
        if self._is_admin(query):
            return "admin"
        auth = self.headers.get("Authorization", "")
        given = auth[7:] if auth.lower().startswith("bearer ") else (query.get("token") or [""])[0]
        return session_user(given) or "?"

    def _client_ip(self) -> str:
        return (self.headers.get("CF-Connecting-IP") or self.client_address[0] or "?").strip()

    def _login(self):
        ip = self._client_ip()
        if login_limiter.blocked(ip):
            return self._send(429, {"error": "muitas tentativas, tente mais tarde"})
        h = self.headers
        user = (h.get("X-Subsonic-User") or "").strip()
        if not user or len(user) > 200:
            return self._send(401, {"error": "unauthorized"})
        try:
            ok = navidrome_accepts(user, (h.get("X-Subsonic-Token") or "").strip(),
                                   (h.get("X-Subsonic-Salt") or "").strip(),
                                   (h.get("X-Subsonic-Password") or "").strip())
        except (OSError, ValueError):
            return self._send(503, {"error": "navidrome indisponivel"})
        if not ok:
            login_limiter.failed(ip)
            log.info("Login recusado para %s", user)
            return self._send(401, {"error": "unauthorized"})
        token, expires = issue_session(user)
        log.info("Sessao emitida para %s", user)
        return self._send(200, {"token": token, "expires_at": expires, "user": user})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "Authorization, Content-Type, X-Subsonic-User, X-Subsonic-Token, "
                         "X-Subsonic-Salt, X-Subsonic-Password")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = url.path.rstrip("/") or "/"
        query = urllib.parse.parse_qs(url.query)
        if path in ("/", "/index.html"):
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if path == "/health":
            return self._send(200, {"ok": True})
        if path == "/auth/info":
            return self._send(200, {"login": "navidrome", "navidrome_hosts_sha256": HOST_HASHES})
        if path in ("/reports", "/reports/view"):
            if not self._is_admin(query):
                return self._send(401, {"error": "unauthorized"})
            if path == "/reports":
                status = (query.get("status") or [None])[0]
                return self._send(200, {"reports": reports.listing(status)})
            token = (query.get("token") or [""])[0]
            return self._send(200, reports.html(token), "text/html; charset=utf-8")
        if not self._authorized(query):
            return self._send(401, {"error": "unauthorized"})
        refresh = (query.get("refresh") or ["0"])[0] in ("1", "true")
        try:
            if path == "/playlists":
                return self._send(200, {"playlists": [
                    {"id": "new-releases", "title": "Lancamentos", "path": "/playlists/new-releases"},
                    {"id": "recommended", "title": "Recomendadas para voce", "path": "/playlists/recommended"},
                    {"id": "charts-br", "title": "Top Brasil", "path": "/playlists/charts?country=BR"},
                    {"id": "charts-global", "title": "Top Global", "path": "/playlists/charts?country=GLOBAL"},
                ]})
            if path == "/playlists/new-releases":
                return self._send(200, cache.get("new", build_new_releases, refresh=refresh))
            if path == "/playlists/recommended":
                return self._send(200, cache.get("rec", build_recommended, refresh=refresh))
            if path == "/playlists/charts":
                country = (query.get("country") or ["BR"])[0].upper()
                return self._send(200, cache.get(f"chart-{country}", lambda: build_charts(country),
                                                  ttl=1800, refresh=refresh))
            if path == "/home":
                return self._send(200, cache.get("home", build_home, refresh=refresh))
            m = re.fullmatch(r"/playlists/mix/(\d+)", path)
            if m:
                aid = int(m.group(1))
                return self._send(200, cache.get(f"mix-{aid}", lambda: build_mix(aid), refresh=refresh))
            if path == "/artist-missing":
                name = (query.get("name") or [""])[0].strip()
                if not name:
                    return self._send(400, {"error": "use ?name=artista"})
                return self._send(200, cache.get(f"missing-{name.lower()}", lambda: artist_missing(name),
                                                  ttl=1800, refresh=refresh))
            if path == "/search":
                q = (query.get("q") or [""])[0].strip()
                kind = (query.get("type") or ["track"])[0]
                if not q or kind not in SEARCH_TYPES:
                    return self._send(400, {"error": "use ?q=texto&type=track|album|artist"})
                return self._send(200, cache.get(f"search-{kind}-{q.lower()}", lambda: search(q, kind),
                                                  ttl=600))
            m = re.fullmatch(r"/browse/(album|artist)/(\d+)", path)
            if m:
                build = browse_album if m.group(1) == "album" else browse_artist
                key = f"browse-{m.group(1)}-{m.group(2)}"
                return self._send(200, cache.get(key, lambda: build(int(m.group(2))), ttl=1800,
                                                  refresh=refresh))
            m = re.fullmatch(r"/preview/(\d+)", path)
            if m:
                t = deezer.get(f"/track/{m.group(1)}")
                if not t.get("preview"):
                    return self._send(404, {"error": "sem preview"})
                return self._send(302, b"", headers={"Location": t["preview"]})
            if path == "/download/queue":
                return self._send(200, deemix.queue())
            return self._send(404, {"error": "not found"})
        except LookupError as exc:
            return self._send(404, {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            log.exception("Erro em %s", path)
            return self._send(502, {"error": str(exc)})

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        path = url.path.rstrip("/")
        if path == "/auth/session":
            return self._login()
        m = re.fullmatch(r"/reports/(\d+)/resolve", path)
        if m:
            if not self._is_admin(query):
                return self._send(401, {"error": "unauthorized"})
            reports.resolve(int(m.group(1)))
            token = urllib.parse.quote((query.get("token") or [""])[0])
            return self._send(303, b"", headers={"Location": f"/reports/view?token={token}"})
        if not self._authorized(query):
            return self._send(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(length, 10000)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "JSON invalido"})
        if path == "/report":
            try:
                status, res = reports.handle(self._user(query), body)
            except Exception as exc:  # noqa: BLE001
                log.exception("Reporte falhou")
                return self._send(502, {"error": str(exc)})
            return self._send(status, res)
        if path in QUEUE_ACTIONS:
            route, needs_uuid = QUEUE_ACTIONS[path]
            uuid = str(body.get("uuid") or "")
            if needs_uuid and not re.fullmatch(r"(track|album|playlist|artist)_\d+_\d+", uuid):
                return self._send(400, {"error": "uuid invalido"})
            try:
                res = deemix.action(route, {"uuid": uuid} if needs_uuid else None)
            except Exception as exc:  # noqa: BLE001
                log.exception("deemix")
                return self._send(502, {"error": f"deemix: {exc}"})
            ok = not (isinstance(res, dict) and res.get("result") is False)
            log.info("Fila %s %s -> %s", route, uuid, "ok" if ok else res)
            return self._send(200 if ok else 404, {"ok": ok})
        if path != "/download":
            return self._send(404, {"error": "not found"})
        target = body.get("url")
        if not target and body.get("type") in ("track", "album", "playlist", "artist") and body.get("id"):
            target = f"https://www.deezer.com/{body['type']}/{int(body['id'])}"
        if not target or not DEEZER_URL.match(target):
            return self._send(400, {"error": "url precisa ser um link do Deezer (track/album/playlist/artist)"})
        try:
            res = deemix.add(target)
        except Exception as exc:  # noqa: BLE001
            log.exception("deemix")
            return self._send(502, {"error": f"deemix: {exc}"})
        ok = not (isinstance(res, dict) and res.get("result") is False)
        log.info("Download %s -> %s", target, "ok" if ok else res)
        return self._send(200 if ok else 502, {"queued": ok, "url": target, "deemix": res})


def background():
    while True:
        try:
            if scanner.due():
                scanner.scan()
                cache.items.pop("new", None)
        except Exception:  # noqa: BLE001
            log.exception("Varredura falhou")
        reports.tick()
        time.sleep(300)


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        datefmt="%Y-%m-%d %H:%M:%S")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=background, daemon=True).start()
    port = int(os.environ.get("PORT", "8085"))
    log.info("discover ouvindo em :%d", port)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
