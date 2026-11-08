"""Reportes: python3 -m unittest test_reports (na pasta server/discover)."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import reports as r


def normalize(text):
    import re
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (text or "").lower())).strip()


def normalize_title(title):
    import re
    return normalize(re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", title or ""))


def split_artists(name):
    import re
    return [normalize(p) for p in re.split(r"\s*(?:,|&| feat\.? )\s*", name or "") if p.strip()]


LRC = "[ti:Song]\n[00:01.00]one\n[00:05.50]two\n[01:10.00]three\n"


class LrcTest(unittest.TestCase):
    def test_parse(self):
        p = r.parse_lrc(LRC)
        self.assertTrue(p["synced"])
        self.assertEqual(p["lines"][0], (1000, "one"))
        self.assertEqual(p["tags"]["ti"], "Song")

    def test_offset_tag_is_applied(self):
        p = r.parse_lrc("[offset:500]\n[00:02.00]a\n")
        self.assertEqual(p["lines"], [(1500, "a")])

    def test_shift(self):
        out = r.shift_lrc(LRC + "[offset:+100]\n", 500)
        self.assertIn("[00:01.50]one", out)
        self.assertIn("[01:10.50]three", out)
        self.assertNotIn("offset", out)
        self.assertIn("[00:00.00]one", r.shift_lrc(LRC, -5000))

    def test_same_lyrics(self):
        self.assertTrue(r.same_lyrics(LRC, "one\ntwo\nthree"))
        self.assertFalse(r.same_lyrics(LRC, "something else entirely here"))


class ReportsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.music = self.tmp / "music"
        (self.music / "Artist" / "Album").mkdir(parents=True)
        self.audio = self.music / "Artist" / "Album" / "01 - Song.mp3"
        self.audio.write_bytes(b"x")
        self.nd = self.tmp / "navidrome.db"
        conn = sqlite3.connect(self.nd)
        conn.execute("create table media_file (id text, path text, title text, artist text, album text,"
                     " album_artist text, album_id text, duration real, missing int default 0)")
        conn.execute("insert into media_file values ('s1', 'Artist/Album/01 - Song.mp3', 'Song',"
                     " 'Artist', 'Album', 'Artist', 'a1', 200, 0)")
        conn.commit()
        conn.close()
        self.rep = r.Reports(
            db_path=self.tmp / "reports.db", nd_db=self.nd, music_dir=self.music, nd_music_dir="/music",
            backup_dir=self.tmp / "backup", deezer=mock.Mock(), deemix=mock.Mock(),
            http_get_json=mock.Mock(side_effect=Exception("offline")), normalize=normalize,
            normalize_title=normalize_title, split_artists=split_artists)

    def test_local_path_stays_inside_library(self):
        self.assertEqual(self.rep.local_path("/music/Artist/Album/01 - Song.mp3"), self.audio.resolve())
        self.assertEqual(self.rep.local_path("Artist/Album/01 - Song.mp3"), self.audio.resolve())
        self.assertIsNone(self.rep.local_path("../../etc/passwd"))
        self.assertIsNone(self.rep.local_path(""))

    def test_validation(self):
        self.assertEqual(self.rep.handle("u", {"kind": "nope", "songId": "s1"})[0], 400)
        self.assertEqual(self.rep.handle("u", {"kind": "other", "songId": "../x"})[0], 400)
        self.assertEqual(self.rep.handle("u", {"kind": "other", "songId": "zz"})[0], 404)
        self.assertEqual(self.rep.handle("u", {"kind": "lyrics_offset", "songId": "s1",
                                                "offsetMs": 99999})[0], 400)

    def test_offset_rewrites_lrc_and_keeps_backup(self):
        lrc = self.audio.with_suffix(".lrc")
        lrc.write_text(LRC)
        status, res = self.rep.handle("dino", {"kind": "lyrics_offset", "songId": "s1", "offsetMs": -500})
        self.assertEqual((status, res["status"]), (200, "fixed"))
        self.assertIn("[00:00.50]one", lrc.read_text())
        self.assertEqual(res["lyrics"], lrc.read_text())
        self.assertEqual(len(list((self.tmp / "backup").iterdir())), 1)
        row = self.rep.listing()[0]
        self.assertEqual((row["user"], row["offset_ms"], row["status"]), ("dino", -500, "fixed"))

    def test_wrong_lyrics_picks_matching_synced_candidate(self):
        lrc = self.audio.with_suffix(".lrc")
        lrc.write_text(LRC)
        cands = [
            {"source": "LRCLIB", "id": "a", "title": "Song", "artist": "Artist", "duration": 200,
             "synced_lrc": LRC, "plain": "", "instrumental": False},  # a mesma letra errada
            {"source": "LRCLIB", "id": "b", "title": "Song", "artist": "Artist", "duration": 230,
             "synced_lrc": "[00:01.00]far\n", "plain": "", "instrumental": False},
            {"source": "LRCLIB", "id": "c", "title": "Song", "artist": "Artist", "duration": 201,
             "synced_lrc": "[00:01.00]right words\n[03:10.00]end\n", "plain": "", "instrumental": False},
            {"source": "LRCLIB", "id": "d", "title": "Song", "artist": "Artist", "duration": 200,
             "synced_lrc": "", "plain": "plain words", "instrumental": False},
        ]
        with mock.patch.object(self.rep, "candidates", return_value=cands):
            status, res = self.rep.handle("dino", {"kind": "lyrics_wrong", "songId": "s1"})
        self.assertEqual(res["status"], "fixed")
        self.assertIn("right words", lrc.read_text())

    def test_synced_longer_than_track_is_rejected(self):
        song = self.rep.song("s1")
        cands = [{"source": "LRCLIB", "id": "x", "title": "Song", "artist": "Artist", "duration": 200,
                  "synced_lrc": "[00:01.00]a\n[04:30.00]b\n", "plain": "", "instrumental": False}]
        with mock.patch.object(self.rep, "candidates", return_value=cands):
            self.assertIsNone(self.rep.best_lyrics(song, need_synced=True))

    def test_not_found_goes_to_admin_list(self):
        with mock.patch.object(self.rep, "candidates", return_value=[]):
            _, res = self.rep.handle("dino", {"kind": "lyrics_missing", "songId": "s1"})
        self.assertEqual(res["status"], "not_found")
        self.assertEqual(self.rep.listing("manual")[0]["kind"], "lyrics_missing")
        rid = self.rep.listing("manual")[0]["id"]
        self.assertTrue(self.rep.resolve(rid))
        self.assertEqual(self.rep.listing("manual"), [])

    def test_matches_checks_title_artist_duration(self):
        song = self.rep.song("s1")
        self.assertTrue(self.rep._matches(song, {"title": "Song (feat. X)", "artist": "Artist", "duration": 202}))
        self.assertFalse(self.rep._matches(song, {"title": "Other", "artist": "Artist", "duration": 200}))
        self.assertFalse(self.rep._matches(song, {"title": "Song", "artist": "Someone", "duration": 200}))
        self.assertFalse(self.rep._matches(song, {"title": "Song", "artist": "Artist", "duration": 260}))

    def test_suspicious(self):
        song = self.rep.song("s1")
        self.assertIsNone(self.rep.suspicious(song, LRC))
        self.assertEqual(self.rep.suspicious(song, "[00:01.00]a\n[04:00.00]b\n"), "letra mais longa que a faixa")
        self.assertEqual(self.rep.suspicious(song, "[length:4:30]\n[00:01.00]a\n"), "[length:] diferente da faixa")
        self.assertEqual(self.rep.suspicious(song, "[ti:Completely Different]\n[00:01.00]a\n"),
                         "[ti:] de outra musica")
        self.assertEqual(self.rep.suspicious(song, "just words\n"), "sem tempo")

    def test_audio_redownload_and_restore(self):
        self.rep.deezer_track = mock.Mock(return_value={"id": 42})
        self.rep.deemix.add.return_value = {"result": True}
        _, res = self.rep.handle("dino", {"kind": "audio", "songId": "s1"})
        self.assertEqual(res["status"], "queued")
        self.assertFalse(self.audio.exists())
        self.rep.deemix.add.assert_called_with("https://www.deezer.com/track/42")
        # deemix nunca entregou: depois do prazo o original volta
        with mock.patch.object(r, "AUDIO_WAIT", -1):
            self.rep.check_audio()
        self.assertTrue(self.audio.exists())
        self.assertEqual(self.rep.listing()[0]["status"], "manual")

    def test_audio_new_file_clears_backup(self):
        self.rep.deezer_track = mock.Mock(return_value={"id": 42})
        self.rep.deemix.add.return_value = {}
        self.rep.handle("dino", {"kind": "audio", "songId": "s1"})
        self.audio.write_bytes(b"new")
        self.rep.check_audio()
        self.assertEqual(self.rep.listing()[0]["status"], "fixed")
        self.assertEqual([p.name for p in self.audio.parent.iterdir()], ["01 - Song.mp3"])

    def test_rate_limit(self):
        with mock.patch.object(r, "USER_LIMIT", 2):
            for _ in range(2):
                self.assertEqual(self.rep.handle("u", {"kind": "other", "songId": "s1"})[0], 200)
            self.assertEqual(self.rep.handle("u", {"kind": "other", "songId": "s1"})[0], 429)


if __name__ == "__main__":
    unittest.main()
