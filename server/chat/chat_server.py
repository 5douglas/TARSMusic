"""TARSMusic chat: messages between users of the same Navidrome server.

Standard library only. Every request carries the caller's Subsonic credentials
(u + t + s, or u + p) in X-Subsonic-* headers; the service checks them once
against Navidrome's ping.view and caches the result for a few minutes, so a
user can only read and send as themselves.

Data lives in one SQLite file (DB_PATH). Usernames are stored lowercase.
"""

import base64
import binascii
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NAVIDROME_URL = os.environ.get("NAVIDROME_URL", "http://127.0.0.1:4533").rstrip("/")
ADMIN_USER = os.environ.get("NAVIDROME_ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("NAVIDROME_ADMIN_PASSWORD", "")
DB_PATH = os.environ.get("DB_PATH", "/data/chat.db")
PORT = int(os.environ.get("PORT", "8087"))
HOST = os.environ.get("HOST", "127.0.0.1")

AUTH_TTL = 600
USERS_TTL = 600
MAX_TEXT = 4000
MAX_PAGE = 200
SHARE_KINDS = ("song", "album", "artist", "playlist")

_auth_cache = {}
_auth_lock = threading.Lock()
_users_cache = {"at": 0.0, "users": []}
_users_lock = threading.Lock()


# ------------------------------------------------------------------ db

def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = db()
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            display TEXT NOT NULL,
            last_seen REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS contacts (
            owner TEXT NOT NULL,
            contact TEXT NOT NULL,
            added_at REAL NOT NULL,
            PRIMARY KEY (owner, contact)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            recipient TEXT NOT NULL,
            body TEXT NOT NULL,
            share TEXT,
            created_at REAL NOT NULL,
            read_at REAL
        );
        CREATE TABLE IF NOT EXISTS avatars (
            username TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_pair ON messages (sender, recipient, id);
        CREATE INDEX IF NOT EXISTS messages_inbox ON messages (recipient, read_at);
        """
    )
    conn.commit()
    conn.close()


# ------------------------------------------------------------ navidrome

def _get_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=10) as res:
        return json.loads(res.read().decode("utf-8"))


def verify_subsonic(user, token, salt, password):
    """True when Navidrome accepts these credentials (cached for AUTH_TTL)."""
    key = (user.lower(), token, salt, password)
    now = time.time()
    with _auth_lock:
        hit = _auth_cache.get(key)
        if hit and hit > now:
            return True
    params = {"u": user, "v": "1.16.1", "c": "tarsmusic-chat", "f": "json"}
    if token and salt:
        params.update(t=token, s=salt)
    elif password:
        params["p"] = password
    else:
        return False
    try:
        body = _get_json(f"{NAVIDROME_URL}/rest/ping.view?{urllib.parse.urlencode(params)}")
    except (urllib.error.URLError, ValueError, OSError):
        return False
    ok = body.get("subsonic-response", {}).get("status") == "ok"
    if ok:
        with _auth_lock:
            if len(_auth_cache) > 5000:
                _auth_cache.clear()
            _auth_cache[key] = now + AUTH_TTL
    return ok


AVATAR_BODY_LIMIT = 400 * 1024
AVATAR_MAX_BYTES = 256 * 1024


def valid_avatar(data):
    """A base64 JPEG, PNG or WebP of at most AVATAR_MAX_BYTES."""
    if not isinstance(data, str) or len(data) > AVATAR_BODY_LIMIT:
        return False
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        return False
    if not raw or len(raw) > AVATAR_MAX_BYTES:
        return False
    return raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n" or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")


def navidrome_users():
    """Every account on the server, via the admin login. Empty when not configured or failing."""
    if not ADMIN_USER or not ADMIN_PASSWORD:
        return []
    now = time.time()
    with _users_lock:
        if now - _users_cache["at"] < USERS_TTL:
            return _users_cache["users"]
    users = []
    try:
        login = _get_json(
            f"{NAVIDROME_URL}/auth/login",
            data=json.dumps({"username": ADMIN_USER, "password": ADMIN_PASSWORD}).encode(),
            headers={"Content-Type": "application/json"},
        )
        rows = _get_json(
            f"{NAVIDROME_URL}/api/user?_start=0&_end=1000",
            headers={"x-nd-authorization": f"Bearer {login['token']}"},
        )
        for row in rows:
            name = (row.get("userName") or "").strip()
            if name:
                users.append({"username": name.lower(), "name": row.get("name") or name})
    except (urllib.error.URLError, ValueError, OSError, KeyError, TypeError):
        users = []
    with _users_lock:
        _users_cache["at"] = now
        _users_cache["users"] = users
    return users


# ------------------------------------------------------------- helpers

def message_row(row):
    return {
        "id": row["id"],
        "from": row["sender"],
        "to": row["recipient"],
        "text": row["body"],
        "share": json.loads(row["share"]) if row["share"] else None,
        "sentAt": int(row["created_at"] * 1000),
        "readAt": int(row["read_at"] * 1000) if row["read_at"] else None,
    }


def clean_share(share):
    """A shared song/album/artist/playlist card, or None. Only known string fields survive."""
    if not isinstance(share, dict) or share.get("kind") not in SHARE_KINDS:
        return None
    if not isinstance(share.get("id"), str) or not share["id"]:
        return None
    out = {"kind": share["kind"], "id": share["id"][:200]}
    for field in ("title", "subtitle", "coverArt"):
        value = share.get(field)
        if isinstance(value, str) and value:
            out[field] = value[:300]
    return out


def all_users(conn):
    """username -> display name: Navidrome's list plus everyone who opened the chat."""
    known = {u["username"]: u["name"] for u in navidrome_users()}
    for row in conn.execute("SELECT username, display FROM users"):
        known.setdefault(row["username"], row["display"])
    return known


USERNAME_RE = re.compile(r"^[^\s/]{1,100}$")


# ------------------------------------------------------------- handler

class Handler(BaseHTTPRequestHandler):
    server_version = "tarsmusic-chat"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    # ---- plumbing
    def _send(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Subsonic-User, X-Subsonic-Token, X-Subsonic-Salt, X-Subsonic-Password",
        )

    def _body(self, limit=64 * 1024):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > limit:
            return {}
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _user(self):
        user = (self.headers.get("X-Subsonic-User") or "").strip()
        if not user or not USERNAME_RE.match(user):
            return None
        ok = verify_subsonic(
            user,
            self.headers.get("X-Subsonic-Token") or "",
            self.headers.get("X-Subsonic-Salt") or "",
            self.headers.get("X-Subsonic-Password") or "",
        )
        return user if ok else None

    def _route(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith("/chat"):
            path = path[len("/chat"):]
        return path.rstrip("/") or "/", urllib.parse.parse_qs(parsed.query)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method):
        path, query = self._route()
        if method == "GET" and path == "/health":
            return self._send(200, {"ok": True})
        display = self._user()
        if not display:
            return self._send(401, {"error": "unauthorized"})
        me = display.lower()
        # A profile picture (base64 JPEG/PNG) is the only large body.
        limit = AVATAR_BODY_LIMIT if path == "/avatar" else 64 * 1024
        body = self._body(limit) if method == "POST" else {}
        conn = db()
        try:
            conn.execute(
                "INSERT INTO users (username, display, last_seen) VALUES (?, ?, ?) "
                "ON CONFLICT(username) DO UPDATE SET last_seen = excluded.last_seen",
                (me, display, time.time()),
            )
            conn.commit()
            status, payload = self._handle(conn, me, method, path, query, body)
        finally:
            conn.close()
        self._send(status, payload)

    # ---- endpoints
    def _handle(self, conn, me, method, path, query, body):
        if method == "GET" and path == "/me":
            return 200, {"username": me}

        if method == "GET" and path == "/users":
            # Nobody can browse the server's accounts: this lists only the caller's own
            # contacts (kept for app versions that read it as the people list).
            users = all_users(conn)
            rows = conn.execute("SELECT contact FROM contacts WHERE owner = ?", (me,)).fetchall()
            items = [
                {"username": r["contact"], "name": users.get(r["contact"], r["contact"]), "contact": True}
                for r in rows
            ]
            items.sort(key=lambda c: c["name"].lower())
            return 200, {"items": items}

        if method == "GET" and path == "/users/lookup":
            # Exact username only, so the account list can't be enumerated by prefix.
            target = (query.get("username") or [""])[0].strip().lower()
            users = all_users(conn)
            if not target or target == me or target not in users:
                return 404, {"error": "unknown user"}
            row = conn.execute(
                "SELECT 1 FROM contacts WHERE owner = ? AND contact = ?", (me, target)
            ).fetchone()
            return 200, {"user": {"username": target, "name": users[target], "contact": row is not None}}

        if method == "POST" and path == "/avatar":
            # The caller's own profile picture, or null to remove it.
            if "data" not in body:
                # Missing, unreadable or over the size limit.
                return 400, {"error": "invalid image"}
            data = body.get("data")
            if data is None:
                conn.execute("DELETE FROM avatars WHERE username = ?", (me,))
                conn.commit()
                return 200, {"ok": True}
            if not valid_avatar(data):
                return 400, {"error": "invalid image"}
            conn.execute(
                "INSERT INTO avatars (username, data, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                (me, data, time.time()),
            )
            conn.commit()
            return 200, {"ok": True}

        if method == "GET" and path.startswith("/avatar/"):
            target = urllib.parse.unquote(path[len("/avatar/"):]).lower()
            row = conn.execute(
                "SELECT data, updated_at FROM avatars WHERE username = ?", (target,)
            ).fetchone()
            if not row:
                return 404, {"error": "no avatar"}
            return 200, {"username": target, "data": row["data"], "updatedAt": row["updated_at"]}

        if method == "GET" and path == "/contacts":
            users = all_users(conn)
            rows = conn.execute(
                "SELECT contact FROM contacts WHERE owner = ? ORDER BY added_at", (me,)
            ).fetchall()
            items = [{"username": r["contact"], "name": users.get(r["contact"], r["contact"])} for r in rows]
            items.sort(key=lambda c: c["name"].lower())
            return 200, {"items": items}

        if method == "POST" and path == "/contacts":
            target = str(body.get("username") or "").strip().lower()
            if not target or target == me or target not in all_users(conn):
                return 404, {"error": "unknown user"}
            conn.execute(
                "INSERT OR IGNORE INTO contacts (owner, contact, added_at) VALUES (?, ?, ?)",
                (me, target, time.time()),
            )
            conn.commit()
            return 200, {"ok": True}

        if method == "DELETE" and path.startswith("/contacts/"):
            target = urllib.parse.unquote(path[len("/contacts/"):]).lower()
            conn.execute("DELETE FROM contacts WHERE owner = ? AND contact = ?", (me, target))
            conn.commit()
            return 200, {"ok": True}

        if method == "GET" and path == "/conversations":
            users = all_users(conn)
            rows = conn.execute(
                """
                SELECT m.* FROM messages m
                JOIN (
                    SELECT CASE WHEN sender = ? THEN recipient ELSE sender END AS peer, MAX(id) AS last_id
                    FROM messages WHERE sender = ? OR recipient = ? GROUP BY peer
                ) t ON m.id = t.last_id
                ORDER BY m.id DESC
                """,
                (me, me, me),
            ).fetchall()
            unread = {
                r["sender"]: r["n"]
                for r in conn.execute(
                    "SELECT sender, COUNT(*) AS n FROM messages WHERE recipient = ? AND read_at IS NULL GROUP BY sender",
                    (me,),
                )
            }
            items = []
            for r in rows:
                peer = r["recipient"] if r["sender"] == me else r["sender"]
                items.append({
                    "username": peer,
                    "name": users.get(peer, peer),
                    "last": message_row(r),
                    "unread": unread.get(peer, 0),
                })
            return 200, {"items": items}

        if method == "GET" and path == "/unread":
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM messages WHERE recipient = ? AND read_at IS NULL", (me,)
            ).fetchone()
            return 200, {"count": row["n"]}

        if method == "GET" and path == "/messages":
            peer = (query.get("with") or [""])[0].strip().lower()
            if not peer:
                return 400, {"error": "missing with"}
            after = int((query.get("after") or ["0"])[0] or 0)
            before = int((query.get("before") or ["0"])[0] or 0)
            limit = max(1, min(MAX_PAGE, int((query.get("limit") or ["50"])[0] or 50)))
            pair = "((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))"
            args = [me, peer, peer, me]
            if after:
                rows = conn.execute(
                    f"SELECT * FROM messages WHERE {pair} AND id > ? ORDER BY id ASC LIMIT ?",
                    args + [after, limit],
                ).fetchall()
            else:
                cond = " AND id < ?" if before else ""
                extra = [before] if before else []
                rows = conn.execute(
                    f"SELECT * FROM messages WHERE {pair}{cond} ORDER BY id DESC LIMIT ?",
                    args + extra + [limit],
                ).fetchall()[::-1]
            return 200, {"items": [message_row(r) for r in rows]}

        if method == "POST" and path == "/messages":
            peer = str(body.get("to") or "").strip().lower()
            text = str(body.get("text") or "").strip()[:MAX_TEXT]
            share = clean_share(body.get("share"))
            if not peer or peer == me or peer not in all_users(conn):
                return 404, {"error": "unknown user"}
            if not text and not share:
                return 400, {"error": "empty message"}
            cur = conn.execute(
                "INSERT INTO messages (sender, recipient, body, share, created_at) VALUES (?, ?, ?, ?, ?)",
                (me, peer, text, json.dumps(share) if share else None, time.time()),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM messages WHERE id = ?", (cur.lastrowid,)).fetchone()
            return 200, {"message": message_row(row)}

        if method == "POST" and path == "/read":
            peer = str(body.get("with") or "").strip().lower()
            conn.execute(
                "UPDATE messages SET read_at = ? WHERE recipient = ? AND sender = ? AND read_at IS NULL",
                (time.time(), me, peer),
            )
            conn.commit()
            return 200, {"ok": True}

        if method == "DELETE" and path.startswith("/messages/"):
            try:
                msg_id = int(path[len("/messages/"):])
            except ValueError:
                return 400, {"error": "bad id"}
            conn.execute("DELETE FROM messages WHERE id = ? AND sender = ?", (msg_id, me))
            conn.commit()
            return 200, {"ok": True}

        return 404, {"error": "not found"}


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"tarsmusic-chat listening on {PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
