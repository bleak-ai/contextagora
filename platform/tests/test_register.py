import asyncio
from unittest.mock import patch
from src.routes.modules import api_register_module
from src.services.manifest import ModuleManifest, write_manifest


def test_register_reads_manifest_and_generates_llms(tmp_path):
    """Register should read files from disk, generate llms.txt, and load the module."""
    (tmp_path / "info.md").write_text("# stripe\n\n## Purpose\nBilling API\n")
    manifest = ModuleManifest(
        name="stripe", kind="integration", summary="Billing API",
        secrets=["STRIPE_KEY"], dependencies=["stripe"],
    )
    write_manifest(tmp_path, manifest)

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.regenerate_module_llms_txt") as mock_regen, \
         patch("src.routes.modules.get_loaded_module_names", return_value=[]), \
         patch("src.routes.modules.reload_workspace") as mock_reload:
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.module_exists.return_value = True
        mock_repo.read_file.return_value = "# stripe"  # info.md exists

        result = asyncio.run(api_register_module("stripe"))

    assert result["name"] == "stripe"
    assert result["kind"] == "integration"
    assert result["summary"] == "Billing API"
    mock_regen.assert_called_once()
    mock_reload.assert_called_once_with(["stripe"])


def test_register_404_when_dir_missing():
    """Register should return 404 if module directory doesn't exist."""
    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = False

        result = asyncio.run(api_register_module("nonexistent"))

    assert result.status_code == 404


def test_register_400_when_info_md_missing(tmp_path):
    """Register should return 400 if info.md is missing."""
    manifest = ModuleManifest(name="bad", summary="no info")
    write_manifest(tmp_path, manifest)

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.read_file.side_effect = FileNotFoundError

        result = asyncio.run(api_register_module("bad"))

    assert result.status_code == 400


def test_register_400_when_manifest_missing(tmp_path):
    """Register should return 400 if module.yaml is missing."""
    (tmp_path / "info.md").write_text("# test\n")
    # No module.yaml

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.read_file.return_value = "# test"  # info.md exists

        result = asyncio.run(api_register_module("bad"))

    assert result.status_code == 400


def test_register_400_when_manifest_invalid_yaml(tmp_path):
    """Register should return 400 if module.yaml is malformed."""
    (tmp_path / "info.md").write_text("# test\n")
    (tmp_path / "module.yaml").write_text(": invalid: yaml: [broken")

    with patch("src.routes.modules.git_repo") as mock_repo:
        mock_repo.module_exists.return_value = True
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.read_file.return_value = "# test"

        result = asyncio.run(api_register_module("bad"))

    assert result.status_code == 400


def test_register_loads_any_kind(tmp_path):
    """Register should append the module to loaded state regardless of kind."""
    (tmp_path / "info.md").write_text("# fix bug\n")
    manifest = ModuleManifest(name="fix-bug", kind="task", summary="Fix it")
    write_manifest(tmp_path, manifest)

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.regenerate_module_llms_txt"), \
         patch("src.routes.modules.get_loaded_module_names", return_value=["stripe"]), \
         patch("src.routes.modules.reload_workspace") as mock_reload:
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.module_exists.return_value = True
        mock_repo.read_file.return_value = "# fix bug"

        result = asyncio.run(api_register_module("fix-bug"))

    assert result["name"] == "fix-bug"
    mock_reload.assert_called_once_with(["stripe", "fix-bug"])


def test_register_is_idempotent_for_already_loaded(tmp_path):
    """Register should not duplicate an already-loaded module in the list."""
    (tmp_path / "info.md").write_text("# stripe\n")
    manifest = ModuleManifest(name="stripe", kind="integration", summary="Billing")
    write_manifest(tmp_path, manifest)

    with patch("src.routes.modules.git_repo") as mock_repo, \
         patch("src.routes.modules.regenerate_module_llms_txt"), \
         patch("src.routes.modules.get_loaded_module_names", return_value=["stripe", "linear"]), \
         patch("src.routes.modules.reload_workspace") as mock_reload:
        mock_repo.module_dir.return_value = tmp_path
        mock_repo.module_exists.return_value = True
        mock_repo.read_file.return_value = "# stripe"

        asyncio.run(api_register_module("stripe"))

    mock_reload.assert_called_once_with(["stripe", "linear"])


def test_list_modules_returns_parent_workflow(tmp_path, monkeypatch):
    """Task modules created from a workflow expose parent_workflow on /api/modules."""
    import asyncio
    from src.services import git_repo
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
