"""Tests for kind-aware behavior in /api/modules/{name} routes.

Pattern follows test_modules_archive.py: inline TestClient(app), uses
the conftest.py-provided `patch_modules_repo` fixture which returns a
tmp_path and patches git_repo.settings.MODULES_REPO_DIR.
"""
from pathlib import Path

from fastapi.testclient import TestClient

from src.server import app


def _seed_module(repo: Path, name: str, kind: str, body_file: str, body: str = "# body") -> Path:
    d = repo / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "module.yaml").write_text(f"name: {name}\nkind: {kind}\n")
    (d / "llms.txt").write_text(f"# {name}\n> a {kind}\n")
    (d / body_file).write_text(body)
    return d


def test_get_integration_module_returns_info_md(patch_modules_repo):
    _seed_module(patch_modules_repo, "stripe", "integration", "info.md", body="# stripe info")
    client = TestClient(app)
    r = client.get("/api/modules/stripe")
    assert r.status_code == 200
    assert r.json()["content"] == "# stripe info"


def test_get_task_module_returns_brief_md(patch_modules_repo):
    _seed_module(patch_modules_repo, "fix-billing", "task", "brief.md", body="# fix-billing brief")
    client = TestClient(app)
    r = client.get("/api/modules/fix-billing")
    assert r.status_code == 200
    assert r.json()["content"] == "# fix-billing brief"


def test_get_workflow_module_returns_steps_md(patch_modules_repo):
    _seed_module(patch_modules_repo, "publish-blog", "workflow", "steps.md", body="# steps")
    client = TestClient(app)
    r = client.get("/api/modules/publish-blog")
    assert r.status_code == 200
    assert r.json()["content"] == "# steps"


def test_starter_file_for_unknown_kind_falls_back_to_info_md():
    """Kind not in KIND_SPECS: helper falls back to info.md.

    Note: this is a unit test of `_starter_file_for`, not an integration
    test through the API. Reason: `read_manifest` validates `kind` via
    Pydantic's `ModuleKind` Literal, so an unknown kind never reaches
    the route handler in normal operation. The fallback is defensive
    code for future kinds being added without updating every consumer
    -- exactly the failure mode this plan is trying to prevent -- so it's
    worth pinning at the helper level.
    """
    from src.routes.modules import _starter_file_for
    assert _starter_file_for("garbage") == "info.md"
    assert _starter_file_for("integration") == "info.md"
    assert _starter_file_for("task") == "brief.md"
    assert _starter_file_for("workflow") == "steps.md"


def test_put_task_module_writes_brief_md_not_info_md(patch_modules_repo):
    _seed_module(patch_modules_repo, "fix-billing", "task", "brief.md", body="old")
    client = TestClient(app)
    r = client.put("/api/modules/fix-billing", json={
        "content": "new brief content",
        "summary": "",
        "secrets": [],
        "requirements": [],
    })
    assert r.status_code == 200
    assert (patch_modules_repo / "fix-billing" / "brief.md").read_text() == "new brief content"
    # info.md must NOT have been written.
    assert not (patch_modules_repo / "fix-billing" / "info.md").exists()


def test_delete_starter_file_is_blocked_for_each_kind(patch_modules_repo):
    cases = [
        ("an-integration", "integration", "info.md"),
        ("a-task", "task", "brief.md"),
        ("a-workflow", "workflow", "steps.md"),
    ]
    client = TestClient(app)
    for name, kind, starter in cases:
        _seed_module(patch_modules_repo, name, kind, starter)
        r = client.delete(f"/api/modules/{name}/files/{starter}")
        assert r.status_code == 400, f"{kind} module's {starter} should be undeletable"
        assert "cannot be deleted" in r.json()["error"]
