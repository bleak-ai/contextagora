import yaml
from unittest.mock import patch, MagicMock
from src.services.manifest import ModuleManifest, read_manifest


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


def test_update_module_preserves_kind_and_archived(tmp_path):
    """PUT should not reset kind or archived."""
    import asyncio
    from src.models import UpdateModuleRequest
    from src.routes.modules import api_update_module
    from src.services.manifest import write_manifest

    # Pre-existing manifest: kind=task, archived=True
    existing = ModuleManifest(
        name="my-task", kind="task", summary="old", archived=True,
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
         patch("src.routes.modules.regenerate_module_llms_txt"), \
         patch("src.routes.modules.settings") as mock_settings:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.write_file.return_value = None
        mock_settings.MANAGED_FILES = frozenset({"llms.txt", "module.yaml"})

        asyncio.run(api_update_module("my-task", body))

    manifest = read_manifest(tmp_path)
    assert manifest.kind == "task"           # preserved
    assert manifest.archived is True         # preserved
    assert manifest.summary == "new summary" # updated
    assert manifest.secrets == ["NEW_SECRET"]  # from body
    assert manifest.dependencies == ["new-pkg"]  # from body
