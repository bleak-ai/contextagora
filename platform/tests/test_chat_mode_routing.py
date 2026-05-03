from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from src.models import ChatRequest
from src.routes.chat import _build_allowed_tools, _build_mode_prompt
from src.server import app


def test_chat_request_defaults_mode_to_normal():
    req = ChatRequest(prompt="hello")
    assert req.mode == "normal"


def test_chat_request_accepts_quick():
    req = ChatRequest(prompt="hello", mode="quick")
    assert req.mode == "quick"


def test_chat_request_rejects_invalid_mode():
    with pytest.raises(Exception):  # pydantic ValidationError
        ChatRequest(prompt="hello", mode="loud")


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Set as Path (not str): server's lifespan calls open_db which expects a Path.
    monkeypatch.setattr("src.config.settings.SESSIONS_DB_PATH", tmp_path / "s.db")
    with TestClient(app) as c:
        yield c


def test_get_mode_returns_normal_for_unknown_session(client):
    r = client.get("/api/sessions/unknown/mode")
    assert r.status_code == 200
    assert r.json() == {"mode": "normal"}


def test_put_mode_then_get_returns_set_value(client):
    r = client.put("/api/sessions/sess-1/mode", json={"mode": "quick"})
    assert r.status_code == 200
    r = client.get("/api/sessions/sess-1/mode")
    assert r.json() == {"mode": "quick"}


def test_put_mode_rejects_invalid(client):
    r = client.put("/api/sessions/sess-1/mode", json={"mode": "loud"})
    assert r.status_code == 422  # pydantic validation


def test_allowed_tools_normal_includes_write():
    tools = _build_allowed_tools("normal")
    assert "Write(*)" in tools
    assert "Edit(*)" in tools
    assert "Bash(*)" in tools
    assert "Agent(*)" in tools
    assert "Read(*)" in tools


def test_allowed_tools_quick_excludes_write_edit_bash_agent():
    tools = _build_allowed_tools("quick")
    assert "Write(*)" not in tools
    assert "Edit(*)" not in tools
    assert "Bash(*)" not in tools
    assert "Agent(*)" not in tools
    assert "Read(*)" in tools
    assert "Glob(*)" in tools
    assert "Grep(*)" in tools


def test_mode_prompt_normal_mentions_offloading_enabled():
    p = _build_mode_prompt("normal")
    assert "NORMAL" in p
    assert "offloading enabled" in p.lower()


def test_mode_prompt_quick_mentions_read_only():
    p = _build_mode_prompt("quick")
    assert "QUICK" in p
    assert "read-only" in p.lower() or "do not propose writes" in p.lower()


def test_system_prompt_contains_kind_specs():
    from src.routes.chat import _build_system_prompt
    prompt = _build_system_prompt("normal")
    # The wrapper section is owned by chat/system.md.
    assert "## Module structure" in prompt
    # Per-kind subsections come from the renderer.
    for kind in ("integration", "task", "workflow"):
        assert f"### `{kind}`" in prompt


def test_system_prompt_kind_specs_render_in_quick_mode_too():
    from src.routes.chat import _build_system_prompt
    prompt = _build_system_prompt("quick")
    assert "## Module structure" in prompt
    assert "### `task`" in prompt


def test_system_prompt_has_no_unexpanded_kind_specs_placeholder():
    from src.routes.chat import _build_system_prompt
    prompt = _build_system_prompt("normal")
    assert "{kind_specs}" not in prompt
