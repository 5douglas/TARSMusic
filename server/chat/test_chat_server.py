"""Tests for chat_server.py against a fake Navidrome. Run: python3 -m unittest test_chat_server.py"""

import hashlib
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PASSWORDS = {"douglas": "pw1", "ana": "pw2", "bruno": "pw3"}


class FakeNavidrome(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, payload):
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        if parsed.path == "/rest/ping.view":
            pw = PASSWORDS.get(q.get("u", "").lower())
            ok = pw is not None and (
                q.get("p") == pw or hashlib.md5((pw + q.get("s", "")).encode()).hexdigest() == q.get("t")
            )
            return self._json({"subsonic-response": {"status": "ok" if ok else "failed"}})
        if parsed.path == "/api/user":
            if self.headers.get("x-nd-authorization") != "Bearer admintoken":
                self.send_response(401)
                self.end_headers()
                return
            return self._json([{"userName": u.capitalize(), "name": u.capitalize()} for u in PASSWORDS])
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/auth/login":
            return self._json({"token": "admintoken"})
        self.send_response(404)
        self.end_headers()


def start(server):
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


class ChatServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nd = start(ThreadingHTTPServer(("127.0.0.1", 0), FakeNavidrome))
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ["NAVIDROME_URL"] = f"http://127.0.0.1:{cls.nd.server_address[1]}"
        os.environ["NAVIDROME_ADMIN_USER"] = "admin"
        os.environ["NAVIDROME_ADMIN_PASSWORD"] = "x"
        os.environ["DB_PATH"] = os.path.join(cls.tmp.name, "chat.db")
        import importlib
        import chat_server
        cls.cs = importlib.reload(chat_server)
        cls.cs.init_db()
        cls.srv = start(ThreadingHTTPServer(("127.0.0.1", 0), cls.cs.Handler))
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}/chat"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.nd.shutdown()
        cls.tmp.cleanup()

    def call(self, user, method, path, body=None, password=None, salt="abc"):
        pw = password if password is not None else PASSWORDS.get(user.lower(), "nope")
        headers = {
            "X-Subsonic-User": user,
            "X-Subsonic-Salt": salt,
            "X-Subsonic-Token": hashlib.md5((pw + salt).encode()).hexdigest(),
            "Content-Type": "application/json",
        }
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_rejects_wrong_password(self):
        status, _ = self.call("douglas", "GET", "/me", password="wrong")
        self.assertEqual(status, 401)

    def test_legacy_password_auth(self):
        req = urllib.request.Request(
            self.base + "/me", headers={"X-Subsonic-User": "ana", "X-Subsonic-Password": "pw2"}
        )
        with urllib.request.urlopen(req) as res:
            self.assertEqual(json.loads(res.read())["username"], "ana")

    def test_users_contacts_and_messages(self):
        status, users = self.call("Douglas", "GET", "/users")
        self.assertEqual(status, 200)
        names = [u["username"] for u in users["items"]]
        self.assertEqual(sorted(names), ["ana", "bruno"])

        self.assertEqual(self.call("douglas", "POST", "/contacts", {"username": "Ana"})[0], 200)
        self.assertEqual(self.call("douglas", "POST", "/contacts", {"username": "ghost"})[0], 404)
        _, contacts = self.call("douglas", "GET", "/contacts")
        self.assertEqual([c["username"] for c in contacts["items"]], ["ana"])

        _, sent = self.call("douglas", "POST", "/messages", {"to": "ana", "text": " oi "})
        self.assertEqual(sent["message"]["text"], "oi")
        share = {"kind": "album", "id": "al-1", "title": "Album", "evil": "x"}
        _, sent2 = self.call("douglas", "POST", "/messages", {"to": "ana", "share": share})
        self.assertEqual(sent2["message"]["share"], {"kind": "album", "id": "al-1", "title": "Album"})
        self.assertEqual(self.call("douglas", "POST", "/messages", {"to": "ana", "text": "  "})[0], 400)

        _, unread = self.call("ana", "GET", "/unread")
        self.assertEqual(unread["count"], 2)
        _, convs = self.call("ana", "GET", "/conversations")
        self.assertEqual(convs["items"][0]["username"], "douglas")
        self.assertEqual(convs["items"][0]["unread"], 2)

        _, msgs = self.call("ana", "GET", "/messages?with=douglas")
        self.assertEqual([m["text"] for m in msgs["items"]], ["oi", ""])
        first = msgs["items"][0]["id"]
        _, newer = self.call("ana", "GET", f"/messages?with=douglas&after={first}")
        self.assertEqual(len(newer["items"]), 1)
        _, older = self.call("ana", "GET", f"/messages?with=douglas&before={newer['items'][0]['id']}")
        self.assertEqual([m["id"] for m in older["items"]], [first])

        # bruno can't see the douglas/ana conversation
        _, other = self.call("bruno", "GET", "/messages?with=douglas")
        self.assertEqual(other["items"], [])

        self.call("ana", "POST", "/read", {"with": "douglas"})
        self.assertEqual(self.call("ana", "GET", "/unread")[1]["count"], 0)

        # only the sender can delete
        self.call("ana", "DELETE", f"/messages/{first}")
        self.assertEqual(len(self.call("douglas", "GET", "/messages?with=ana")[1]["items"]), 2)
        self.call("douglas", "DELETE", f"/messages/{first}")
        self.assertEqual(len(self.call("douglas", "GET", "/messages?with=ana")[1]["items"]), 1)

        self.call("douglas", "DELETE", "/contacts/ana")
        self.assertEqual(self.call("douglas", "GET", "/contacts")[1]["items"], [])


if __name__ == "__main__":
    unittest.main()
