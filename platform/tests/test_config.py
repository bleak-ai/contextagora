"""Tests for src.config.Settings."""
from pathlib import Path

from src.config import Settings


def test_sessions_db_path_defaults_under_home_claude(monkeypatch):
    monkeypatch.delenv("SESSIONS_DB_PATH", raising=False)
    s = Settings()
    assert s.SESSIONS_DB_PATH == Path.home() / ".claude" / "contextagora" / "sessions.db"


def test_sessions_db_path_honours_env(monkeypatch, tmp_path):
    monkeypatch.setenv("SESSIONS_DB_PATH", str(tmp_path / "custom.db"))
    s = Settings()
    assert s.SESSIONS_DB_PATH == tmp_path / "custom.db"
