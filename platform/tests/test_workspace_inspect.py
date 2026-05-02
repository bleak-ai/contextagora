"""Tests for list_workspace_files path walking.

The function drives the main sidebar (GET /api/workspace → IntegrationCard).
Must walk top-level, docs/*.md, and scripts/*.py.
"""
from pathlib import Path

import pytest

from src.services.modules.workspace_inspect import list_workspace_files

MANAGED = frozenset({"module.yaml", "llms.txt"})


def test_returns_empty_when_only_managed_files(tmp_path: Path):
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (tmp_path / "llms.txt").write_text("x")
    assert list_workspace_files(tmp_path, MANAGED) == []


def test_returns_top_level_non_managed_files_alphabetical(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (tmp_path / "verify.py").write_text("print('ok')")
    assert list_workspace_files(tmp_path, MANAGED) == ["info.md", "verify.py"]


def test_returns_docs_md_files_with_prefix(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text("# guide")
    (docs / "overview.md").write_text("# overview")
    (docs / "ignored.txt").write_text("skip me")
    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "docs/guide.md",
        "docs/overview.md",
    ]


def test_returns_scripts_py_files_with_prefix(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    (scripts / "create-issue.py").write_text("print('ok')")
    (scripts / "list-projects.py").write_text("print('ok')")
    (scripts / "notes.md").write_text("skip me")
    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "scripts/create-issue.py",
        "scripts/list-projects.py",
    ]


def test_mixed_top_level_docs_and_scripts_are_ordered(tmp_path: Path):
    """Order contract: top-level alphabetical, then docs alphabetical,
    then scripts alphabetical."""
    (tmp_path / "info.md").write_text("# info")
    (tmp_path / "verify.py").write_text("print('ok')")
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")

    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text("g")

    scripts = tmp_path / "scripts"
    scripts.mkdir()
    (scripts / "a.py").write_text("a")
    (scripts / "b.py").write_text("b")

    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "verify.py",
        "docs/guide.md",
        "scripts/a.py",
        "scripts/b.py",
    ]


def test_raises_when_module_dir_missing(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        list_workspace_files(tmp_path / "nope", MANAGED)
