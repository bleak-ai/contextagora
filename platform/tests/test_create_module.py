import yaml
from unittest.mock import patch, MagicMock
from src.services.modules.manifest import ModuleManifest, read_manifest


def test_create_module_uses_body_secrets(tmp_path):
    """Verify secrets come from the request body, not from content parsing."""
    from src.models import CreateModuleRequest
    from src.routes.modules import api_create_module
    import asyncio

    body = CreateModuleRequest(
        name="test-mod",
        kind="integration",
        content="# test\n\n## Auth & access\n\nNo secrets here.\n",
        summary="test module",
        secrets=["MY_SECRET_A", "MY_SECRET_B"],
        requirements=["requests"],
    )

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.reload_workspace"), \
         patch("src.routes.modules.get_loaded_module_names", return_value=[]):
        mock_repo.create_module_dir.return_value = None
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.write_file.return_value = None

        asyncio.run(api_create_module(body))

    manifest = read_manifest(tmp_path)
    assert manifest.secrets == ["MY_SECRET_A", "MY_SECRET_B"]
    assert manifest.dependencies == ["requests"]


def test_update_module_preserves_kind(tmp_path):
    """PUT should not reset kind."""
    import asyncio
    from src.models import UpdateModuleRequest
    from src.routes.modules import api_update_module
    from src.services.modules.manifest import write_manifest

    # Pre-existing manifest: kind=task
    existing = ModuleManifest(
        name="my-task", kind="task", summary="old",
        secrets=["OLD_SECRET"], dependencies=["old-pkg"],
    )
    write_manifest(tmp_path, existing)
    (tmp_path / "info.md").write_text("# old")

    body = UpdateModuleRequest(
        content="# updated task",
        summary="new summary",
        secrets=["NEW_SECRET"],
        requirements=["new-pkg"],
    )

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.settings") as mock_settings:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.write_file.return_value = None
        mock_settings.MANAGED_FILES = frozenset({"llms.txt", "module.yaml"})

        asyncio.run(api_update_module("my-task", body))

    manifest = read_manifest(tmp_path)
    assert manifest.kind == "task"           # preserved
    assert manifest.summary == "new summary" # updated
    assert manifest.secrets == ["NEW_SECRET"]  # from body
    assert manifest.dependencies == ["new-pkg"]  # from body


def test_create_module_rejects_workflow_kind():
    """Workflows must be authored on disk, not via the modal."""
    import asyncio
    from src.models import CreateModuleRequest
    from src.routes.modules import api_create_module

    body = CreateModuleRequest(
        name="my-workflow",
        kind="workflow",
        content="",
    )
    resp = asyncio.run(api_create_module(body))
    # FastAPI route returns a JSONResponse on rejection
    assert resp.status_code == 400
    import json
    payload = json.loads(resp.body)
    assert "workflow" in payload["error"].lower()


def test_list_modules_returns_parent_workflow(tmp_path, monkeypatch):
    """Task modules created from a workflow expose parent_workflow on /api/modules."""
    import asyncio
    from src.services.modules import git_repo
    from src.routes.modules import api_list_modules
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)

    (tmp_path / "maat-support-run-sup-42").mkdir()
    (tmp_path / "maat-support-run-sup-42" / "module.yaml").write_text(
        "name: maat-support-run-sup-42\nkind: task\nparent_workflow: maat-support\n"
    )

    payload = asyncio.run(api_list_modules())
    runs = [m for m in payload["modules"] if m.name == "maat-support-run-sup-42"]
    assert len(runs) == 1
    assert runs[0].parent_workflow == "maat-support"
