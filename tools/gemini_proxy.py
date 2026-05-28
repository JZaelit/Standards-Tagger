#!/usr/bin/env python3
"""Local Gemini proxy — key stays in .env / shell, never pasted in the browser.

Team setup:
  1. Teammate shares the repo-root .env file (gitignored) with GEMINI_API_KEY=...
  2. npm run gemini-proxy
  3. In app Settings: proxy URL http://127.0.0.1:8787 — leave the browser key empty
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parent.parent
BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Loaded once at startup — exact bytes from .env / environment (no JS sanitize).
SERVER_API_KEY = ""
SERVER_KEY_SOURCE = "none"


def load_dotenv() -> None:
    """Load every KEY=VALUE from repo-root .env. Shell env always wins."""
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        val = value.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        if key and val and not os.environ.get(key):
            os.environ[key] = val


def init_server_key() -> None:
    global SERVER_API_KEY, SERVER_KEY_SOURCE
    load_dotenv()
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        SERVER_API_KEY = env_key
        SERVER_KEY_SOURCE = (
            "dotenv" if (REPO_ROOT / ".env").exists() else "environment"
        )
    else:
        SERVER_API_KEY = ""
        SERVER_KEY_SOURCE = "none"


def pick_api_key(header_key: str, body_key: str) -> tuple[str, str]:
    """Server .env key always wins — browser paste cannot override a team key."""
    if SERVER_API_KEY:
        return SERVER_API_KEY, SERVER_KEY_SOURCE
    if header_key:
        return header_key, "client-header"
    if body_key:
        return body_key, "client-body"
    return "", "none"


def verify_key_on_startup() -> None:
    if not SERVER_API_KEY:
        print(
            "No GEMINI_API_KEY yet. Add a .env file at repo root (see .env.example)",
            file=sys.stderr,
        )
        return
    url = f"{BASE}?key={SERVER_API_KEY}"
    req = Request(url, method="GET")
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        models = data.get("models") or []
        print(
            f"Key OK ({SERVER_KEY_SOURCE}, {len(SERVER_API_KEY)} chars, "
            f"ends …{SERVER_API_KEY[-4:]}, {len(models)} models)"
        )
    except HTTPError as exc:
        err = exc.read().decode()
        print(f"WARNING: key check failed ({exc.code}): {err[:200]}", file=sys.stderr)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[gemini_proxy] {self.address_string()} - {fmt % args}\n")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Gemini-Api-Key",
        )

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.rstrip("/") or "/"
        if path in ("/", "/health"):
            self._json(
                200,
                {
                    "ok": True,
                    "service": "gemini_proxy",
                    "has_server_key": bool(SERVER_API_KEY),
                    "key_source": SERVER_KEY_SOURCE,
                    "key_suffix": SERVER_API_KEY[-4:]
                    if len(SERVER_API_KEY) >= 4
                    else None,
                    "key_length": len(SERVER_API_KEY) if SERVER_API_KEY else 0,
                },
            )
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/generate":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": {"message": "Invalid JSON body"}})
            return

        header_key = (self.headers.get("X-Gemini-Api-Key") or "").strip()
        body_key = (body.get("apiKey") or "").strip()
        api_key, key_source = pick_api_key(header_key, body_key)
        if not api_key:
            self._json(
                500,
                {
                    "error": {
                        "message": (
                            "No API key. Add GEMINI_API_KEY to a .env file at the "
                            "repo root (ask your teammate for this file), restart "
                            "the proxy, and leave the browser key field empty."
                        )
                    }
                },
            )
            return

        model = body.get("model", "gemini-2.0-flash")
        parts = body.get("parts") or [{"text": body.get("text", "OK")}]
        payload: dict = {"contents": [{"parts": parts}]}
        if body.get("jsonMode"):
            payload["generationConfig"] = {"responseMimeType": "application/json"}

        url = f"{BASE}/{model}:generateContent?key={api_key}"
        req = Request(url, data=json.dumps(payload).encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode())
        except HTTPError as exc:
            err_body = exc.read().decode()
            try:
                err_json = json.loads(err_body)
            except json.JSONDecodeError:
                err_json = {"error": {"message": err_body, "code": exc.code}}
            err_msg = err_json.get("error", {}).get("message", err_body)
            sys.stderr.write(
                f"[gemini_proxy] Google {exc.code}: {err_msg} "
                f"(source={key_source}, len={len(api_key)}, "
                f"ends …{api_key[-4:] if len(api_key) >= 4 else '????'})\n"
            )
            self._json(exc.code, err_json)
            return

        text = ""
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            pass
        self._json(200, {"text": text, "raw": data, "key_source": key_source})

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    init_server_key()
    verify_key_on_startup()
    port = int(os.environ.get("GEMINI_PROXY_PORT", "8787"))
    httpd = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Gemini proxy listening on http://127.0.0.1:{port}")
    print("Team mode: put GEMINI_API_KEY in .env, leave browser key empty.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
