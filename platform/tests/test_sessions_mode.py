import sqlite3
from pathlib import Path

import pytest

from src.services.chat.sessions_store import (
    ensure_schema,
    get_session_mode,
    open_db,
    set_session_mode,
)


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    db = open_db(tmp_path / "sessions.db")
    ensure_schema(db)
    return db


def test_get_mode_defaults_to_normal_when_unknown(conn):
    assert get_session_mode(conn, "never-seen") == "normal"


def test_set_then_get_mode_roundtrips(conn):
    set_session_mode(conn, "abc", "quick")
    assert get_session_mode(conn, "abc") == "quick"


def test_set_mode_overwrites_existing(conn):
    set_session_mode(conn, "abc", "quick")
    set_session_mode(conn, "abc", "normal")
    assert get_session_mode(conn, "abc") == "normal"


def test_set_mode_rejects_invalid_value(conn):
    with pytest.raises(ValueError):
        set_session_mode(conn, "abc", "loud")
