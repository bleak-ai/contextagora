import json
import sqlite3
from pathlib import Path

from src.services import sessions_store


def _conn():
    c = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(c)
    return c


def test_ensure_schema_is_idempotent():
    c = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(c)
    sessions_store.ensure_schema(c)  # must not raise
    rows = c.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    assert ("messages",) in rows


def test_save_and_list_roundtrip():
    c = _conn()
    msg = {
        "id": "user-abc",
        "role": "user",
        "thinking": "",
        "parts": [{"type": "text", "text": "hello"}],
    }
    sessions_store.save_message(c, "sess1", seq=0, message=msg, created_at_ms=111)
    msgs = sessions_store.list_messages(c, "sess1")
    assert len(msgs) == 1
    assert msgs[0] == {
        "id": "user-abc",
        "role": "user",
        "thinking": "",
        "parts": [{"type": "text", "text": "hello"}],
    }


def test_list_messages_returns_empty_for_unknown_session():
    c = _conn()
    assert sessions_store.list_messages(c, "nope") == []


def test_list_messages_is_ordered_by_seq():
    c = _conn()
    for i, text in enumerate(["one", "two", "three"]):
        sessions_store.save_message(
            c, "s", seq=i,
            message={"id": f"m{i}", "role": "user", "thinking": "",
                     "parts": [{"type": "text", "text": text}]},
            created_at_ms=100 + i,
        )
    out = sessions_store.list_messages(c, "s")
    assert [m["parts"][0]["text"] for m in out] == ["one", "two", "three"]


def test_save_message_is_idempotent_on_pk():
    """Re-saving the same (session_id, seq) must not duplicate or raise."""
    c = _conn()
    msg = {"id": "x", "role": "assistant", "thinking": "", "parts": []}
    sessions_store.save_message(c, "s", seq=0, message=msg, created_at_ms=1)
    sessions_store.save_message(c, "s", seq=0, message=msg, created_at_ms=1)
    assert len(sessions_store.list_messages(c, "s")) == 1


def test_open_db_creates_parent_directory(tmp_path: Path):
    db_path = tmp_path / "nested" / "dir" / "sessions.db"
    c = sessions_store.open_db(db_path)
    sessions_store.ensure_schema(c)
    assert db_path.exists()
