"""Login com conta do Navidrome: python3 -m unittest test_discover_auth (na pasta server/discover)."""
import importlib.util
import os
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


class SessionTest(unittest.TestCase):
    def test_round_trip(self):
        token, expires = d.issue_session("dino")
        self.assertEqual(d.session_user(token), "dino")
        self.assertGreater(expires, time.time())

    def test_rejects_tampered_and_foreign(self):
        token, _ = d.issue_session("dino")
        parts = token.split(".")
        forged = ".".join([parts[0], d._b64(b"admin"), parts[2], parts[3]])
        self.assertIsNone(d.session_user(forged))
        self.assertIsNone(d.session_user(token[:-3] + "abc"))
        self.assertIsNone(d.session_user("admin-token"))
        self.assertIsNone(d.session_user(""))

    def test_rejects_expired(self):
        with mock.patch.object(d, "SESSION_TTL", -10):
            token, _ = d.issue_session("dino")
        self.assertIsNone(d.session_user(token))

    def test_host_hashes_are_published_not_hosts(self):
        self.assertTrue(all(len(h) == 64 for h in d.HOST_HASHES))
        self.assertNotIn("music.douglas.seg.br", d.HOST_HASHES)


class LimiterTest(unittest.TestCase):
    def test_blocks_after_limit(self):
        lim = d.LoginLimiter(limit=3, window=60)
        for _ in range(3):
            self.assertFalse(lim.blocked("1.2.3.4"))
            lim.failed("1.2.3.4")
        self.assertTrue(lim.blocked("1.2.3.4"))
        self.assertFalse(lim.blocked("5.6.7.8"))


class NavidromeCheckTest(unittest.TestCase):
    def test_needs_credentials(self):
        self.assertFalse(d.navidrome_accepts("dino", "", "", ""))


if __name__ == "__main__":
    unittest.main()
