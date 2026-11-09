"""Descobrir personalizado: python3 -m unittest test_discover_home (na pasta server/discover)."""
import importlib.util
import os
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("DISCOVER_TOKEN", "admin-token")
os.environ.setdefault("CACHE_DIR", tempfile.mkdtemp())
_spec = importlib.util.spec_from_file_location("discover", Path(__file__).with_name("discover.py"))
d = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(d)


def make_db(path: Path):
    conn = sqlite3.connect(path)
    conn.executescript("""
        create table media_file (id text, title text, album text, artist text, album_artist text, missing int);
        create table artist (id text, name text, missing int);
        create table user (id text, user_name text);
        create table scrobbles (media_file_id text, user_id text, submission_time int);
        create table annotation (item_id text, item_type text, user_id text, play_count int);
        insert into user values ('u1', 'ana'), ('u2', 'bia');
        insert into media_file values ('m1', 'S1', 'A1', 'Rock Band', 'Rock Band', 0),
                                      ('m2', 'S2', 'A2', 'Samba Group', 'Samba Group', 0);
        insert into artist values ('a1', 'Rock Band', 0), ('a2', 'Samba Group', 0);
    """)
    now = int(time.time())
    conn.executemany("insert into scrobbles values (?, ?, ?)",
                     [("m1", "u1", now)] * 5 + [("m2", "u2", now)] * 3)
    conn.commit()
    conn.close()


class PersonalHomeTest(unittest.TestCase):
    def setUp(self):
        tmp = Path(tempfile.mkdtemp())
        make_db(tmp / "navidrome.db")
        self.lib = d.Library(tmp / "navidrome.db")
        self.lib.refresh(force=True)
        ids = {"rock band": 1, "samba group": 2, "app artist": 3, "mc fulano": 4}
        self.patches = [
            mock.patch.object(d, "library", self.lib),
            mock.patch.object(d.artist_ids, "_autodl", return_value={}),
            mock.patch.object(d.artist_ids, "lookup", side_effect=lambda n, a=None: ids.get(d.normalize(n))),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_history_is_kept_per_user(self):
        self.assertEqual([h["name"] for h in self.lib.history_by_user["ana"]], ["Rock Band"])
        self.assertEqual([h["name"] for h in self.lib.history_by_user["bia"]], ["Samba Group"])

    def test_seeds_follow_the_user_and_the_app_history(self):
        self.assertEqual(d.history_seeds(5, "ana"), [("Rock Band", 1)])
        self.assertEqual(d.history_seeds(5, "BIA"), [("Samba Group", 2)])
        # o historico do app vem primeiro; MC/DJ e repetidos ficam de fora
        self.assertEqual(d.history_seeds(5, "ana", ["App Artist", "MC Fulano", "Rock Band"]),
                         [("App Artist", 3), ("Rock Band", 1)])
        # usuario sem historico nenhum cai no historico geral
        self.assertEqual({n for n, _ in d.history_seeds(5, "novo")}, {"Rock Band", "Samba Group"})

    def test_global_releases_newest_first_without_mc_dj(self):
        data = {"data": [
            {"id": 10, "title": "Old", "release_date": "2026-11-01", "artist": {"id": 1, "name": "X"}},
            {"id": 11, "title": "New", "release_date": "2026-11-07", "artist": {"id": 2, "name": "Y"}},
            {"id": 12, "title": "Funk", "release_date": "2026-11-08", "artist": {"id": 3, "name": "DJ Z"}},
        ]}
        with mock.patch.object(d.deezer, "get", return_value=data) as get:
            out = d.global_releases(10)
        get.assert_called_with("/editorial/0/releases", limit=100)
        self.assertEqual([a["title"] for a in out], ["New", "Old"])


if __name__ == "__main__":
    unittest.main()
