"""Verify that chat SSE stream writes messages into the DB."""
import json
import sqlite3
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.services.chat import sessions_store


def _stream_json_lines(events):
    """Turn a list of Claude stream-json events into the iterable Popen().stdout
    would expose."""
    return iter(json.dumps(ev) + "\n" for ev in events)


def _make_fake_proc(events):
    p = MagicMock()
    p.stdout = _stream_json_lines(events)
    p.stderr = MagicMock(read=lambda: "")
    p.wait = MagicMock(return_value=None)
    p.returncode = 0
    p.args = ["claude"]
    return p


def test_chat_stream_persists_user_and_assistant(tmp_path, monkeypatch):
    # Redirect the sessions DB to a temp file BEFORE importing the app.
    monkeypatch.setenv("SESSIONS_DB_PATH", str(tmp_path / "sessions.db"))

    # Re-import settings + app so env takes effect.
    from importlib import reload
    from src import config as config_mod
    reload(config_mod)
    from src import server as server_mod
    reload(server_mod)

    fake_events = [
        {"type": "system", "session_id": "sess-test", "model": "claude"},
        {"type": "stream_event", "event": {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": "Hi "}}},
        {"type": "stream_event", "event": {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": "there"}}},
        {"type": "result"},
    ]

    with patch("src.services.chat.claude.subprocess.Popen",
               return_value=_make_fake_proc(fake_events)):
        with TestClient(server_mod.app) as client:
            with client.stream("POST", "/api/chat",
                               json={"prompt": "hello"}) as r:
                # Drain SSE
                for _ in r.iter_lines():
                    pass

    conn = sqlite3.connect(str(tmp_path / "sessions.db"))
    msgs = sessions_store.list_messages(conn, "sess-test")
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[0]["parts"][0]["text"] == "hello"
    assert msgs[1]["parts"][0]["text"] == "Hi there"
