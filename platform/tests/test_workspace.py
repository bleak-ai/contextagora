"""Tests for the always-loaded module invariant in services/workspace.py."""


def test_always_loaded_module_names_includes_active_tasks(tmp_path, monkeypatch):
    """Renamed function preserves the existing task invariant."""
    from src.services import git_repo, workspace
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)

    (tmp_path / "task-active").mkdir()
    (tmp_path / "task-active" / "module.yaml").write_text(
        "name: task-active\nkind: task\n"
    )
    (tmp_path / "task-done").mkdir()
    (tmp_path / "task-done" / "module.yaml").write_text(
        "name: task-done\nkind: task\narchived: true\n"
    )
    names = workspace._always_loaded_module_names()
    assert "task-active" in names
    assert "task-done" not in names


def test_always_loaded_module_names_includes_workflows(tmp_path, monkeypatch):
    """Workflows are always loaded — no archived check applies."""
    from src.services import git_repo, workspace
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)

    (tmp_path / "maat-support").mkdir()
    (tmp_path / "maat-support" / "module.yaml").write_text(
        "name: maat-support\nkind: workflow\nentry_step: 1-intake.md\n"
    )
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")

    names = workspace._always_loaded_module_names()
    assert "maat-support" in names
    assert "linear" not in names
