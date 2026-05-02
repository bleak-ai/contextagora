"""Tests for list_module_files path walking.

The function feeds GET /api/modules/{name}/files (ModuleEditor sidebar).
Must walk top-level non-managed files, docs/*.md, and scripts/*.py.
"""
import pytest
from pathlib import Path

from src.services.modules.git_repo import list_module_files

MANAGED = frozenset({"module.yaml", "llms.txt"})


def _setup_module(clone_dir: Path, name: str) -> Path:
    module_dir = clone_dir / name
    module_dir.mkdir(parents=True)
    (module_dir / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (module_dir / "llms.txt").write_text("x")
    return module_dir


def test_empty_when_only_managed(tmp_path: Path):
    _setup_module(tmp_path, "linear")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == []


def test_top_level_md_and_py(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "verify.py").write_text("print('ok')")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == [
        {"name": "info.md", "path": "info.md"},
        {"name": "verify.py", "path": "verify.py"},
    ]


def test_docs_md_surfaced(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "docs").mkdir()
    (module_dir / "docs" / "guide.md").write_text("# guide")
    (module_dir / "docs" / "ignored.txt").write_text("nope")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == [
        {"name": "info.md", "path": "info.md"},
        {"name": "guide.md", "path": "docs/guide.md"},
    ]


def test_scripts_py_surfaced(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "scripts").mkdir()
    (module_dir / "scripts" / "a.py").write_text("a")
    (module_dir / "scripts" / "b.py").write_text("b")
    (module_dir / "scripts" / "notes.md").write_text("nope")
    result = list_module_files("linear", MANAGED, clone_dir=tmp_path)
    assert {"name": "a.py", "path": "scripts/a.py"} in result
    assert {"name": "b.py", "path": "scripts/b.py"} in result
    assert {"name": "notes.md", "path": "scripts/notes.md"} not in result


def test_ordering_top_then_docs_then_scripts(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "docs").mkdir()
    (module_dir / "docs" / "guide.md").write_text("g")
    (module_dir / "scripts").mkdir()
    (module_dir / "scripts" / "a.py").write_text("a")
    result = list_module_files("linear", MANAGED, clone_dir=tmp_path)
    assert result == [
        {"name": "info.md", "path": "info.md"},
        {"name": "guide.md", "path": "docs/guide.md"},
        {"name": "a.py", "path": "scripts/a.py"},
    ]


def test_raises_when_module_not_found(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        list_module_files("nonexistent", MANAGED, clone_dir=tmp_path)
