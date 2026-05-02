"""SQLite-backed message store for chat transcripts.

The DB is a write-through cache of what the server actually streamed to the
client. See docs/superpowers/plans/2026-04-21-durable-session-storage.md.

Uses stdlib sqlite3 — no ORM, no extra dependency. Single table. One
long-lived connection opened at app startup and stashed on app.state.
Callers serialize access via a threading.Lock in the route layer; a
single-process WAL-mode SQLite handles that comfortably.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    session_id    TEXT    NOT NULL,
    seq           INTEGER NOT NULL,
    message_id    TEXT    NOT NULL,
    role          TEXT    NOT NULL,
    thinking      TEXT    NOT NULL DEFAULT '',
    parts_json    TEXT    NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_messages_session_created
    ON messages(session_id, created_at_ms);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    mode       TEXT NOT NULL DEFAULT 'normal'
);
"""


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA)
    conn.commit()


def save_message(
    conn: sqlite3.Connection,
    session_id: str,
    seq: int,
    message: dict,
    created_at_ms: int,
) -> None:
    """Idempotent on (session_id, seq)."""
    conn.execute(
        "INSERT OR REPLACE INTO messages "
        "(session_id, seq, message_id, role, thinking, parts_json, created_at_ms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            session_id,
            seq,
            message.get("id", ""),
            message["role"],
            message.get("thinking", ""),
            json.dumps(message.get("parts", []), ensure_ascii=False),
            created_at_ms,
        ),
    )
    conn.commit()


def list_messages(conn: sqlite3.Connection, session_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT message_id, role, thinking, parts_json "
        "FROM messages WHERE session_id = ? ORDER BY seq ASC",
        (session_id,),
    ).fetchall()
    return [
        {
            "id": mid,
            "role": role,
            "thinking": thinking,
            "parts": json.loads(parts_json),
        }
        for mid, role, thinking, parts_json in rows
    ]


_VALID_MODES = ("normal", "quick")


def get_session_mode(conn: sqlite3.Connection, session_id: str) -> str:
    row = conn.execute(
        "SELECT mode FROM sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    return row[0] if row else "normal"


def set_session_mode(conn: sqlite3.Connection, session_id: str, mode: str) -> None:
    if mode not in _VALID_MODES:
        raise ValueError(f"invalid mode {mode!r}; expected one of {_VALID_MODES}")
    conn.execute(
        "INSERT INTO sessions (session_id, mode) VALUES (?, ?) "
        "ON CONFLICT (session_id) DO UPDATE SET mode = excluded.mode",
        (session_id, mode),
    )
    conn.commit()
