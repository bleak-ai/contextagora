from pathlib import Path

from src.routes.chat import _module_slug_for_path


def test_path_inside_modules_repo_returns_slug(tmp_path):
    modules_repo = tmp_path / "modules-repo"
    target = modules_repo / "linear" / "notes" / "2026-05-02-quirk.md"
    assert _module_slug_for_path(target, modules_repo) == "linear"


def test_path_at_module_root_returns_slug(tmp_path):
    modules_repo = tmp_path / "modules-repo"
    target = modules_repo / "stripe" / "module.yaml"
    assert _module_slug_for_path(target, modules_repo) == "stripe"


def test_path_outside_modules_repo_returns_none(tmp_path):
    modules_repo = tmp_path / "modules-repo"
    target = tmp_path / "other" / "file.md"
    assert _module_slug_for_path(target, modules_repo) is None


def test_path_at_modules_repo_root_returns_none(tmp_path):
    modules_repo = tmp_path / "modules-repo"
    assert _module_slug_for_path(modules_repo, modules_repo) is None
