from pathlib import Path

from src.routes.chat import _tree_event_for_tool


def test_read_inside_context_dir_returns_reading(tmp_path):
    context_dir = tmp_path / "context"
    target = context_dir / "find-room-barcelona" / "info.md"
    result = _tree_event_for_tool(
        "Read",
        {"file_path": str(target)},
        context_dir,
    )
    assert result == ("find-room-barcelona/info.md", "reading")


def test_read_outside_context_dir_returns_none(tmp_path):
    context_dir = tmp_path / "context"
    target = tmp_path / "other" / "file.md"
    assert (
        _tree_event_for_tool("Read", {"file_path": str(target)}, context_dir)
        is None
    )


def test_unknown_tool_returns_none(tmp_path):
    context_dir = tmp_path / "context"
    assert (
        _tree_event_for_tool("Glob", {"pattern": "*.md"}, context_dir) is None
    )


def test_missing_file_path_returns_none(tmp_path):
    context_dir = tmp_path / "context"
    assert _tree_event_for_tool("Read", {}, context_dir) is None


def test_read_supports_path_alias(tmp_path):
    context_dir = tmp_path / "context"
    target = context_dir / "samperalabs" / "posts.md"
    result = _tree_event_for_tool(
        "Read",
        {"path": str(target)},
        context_dir,
    )
    assert result == ("samperalabs/posts.md", "reading")


def test_write_inside_context_dir_returns_writing(tmp_path):
    context_dir = tmp_path / "context"
    target = context_dir / "samperalabs" / "posts.md"
    assert _tree_event_for_tool(
        "Write",
        {"file_path": str(target)},
        context_dir,
    ) == ("samperalabs/posts.md", "writing")


def test_edit_inside_context_dir_returns_writing(tmp_path):
    context_dir = tmp_path / "context"
    target = context_dir / "hetzner-vps" / "info.md"
    assert _tree_event_for_tool(
        "Edit",
        {"file_path": str(target)},
        context_dir,
    ) == ("hetzner-vps/info.md", "writing")


def test_write_outside_context_dir_returns_none(tmp_path):
    context_dir = tmp_path / "context"
    target = tmp_path / "elsewhere" / "x.md"
    assert (
        _tree_event_for_tool("Write", {"file_path": str(target)}, context_dir)
        is None
    )


def test_read_resolved_to_modules_repo_falls_back(tmp_path):
    """Claude Code resolves context/<module> symlinks to the real path
    under modules-repo/. The helper must still emit an event."""
    context_dir = tmp_path / "context"
    modules_repo = tmp_path / "modules-repo"
    target = modules_repo / "find-room-barcelona" / "info.md"
    result = _tree_event_for_tool(
        "Read",
        {"file_path": str(target)},
        context_dir,
        modules_repo,
    )
    assert result == ("find-room-barcelona/info.md", "reading")


def test_path_outside_both_roots_returns_none(tmp_path):
    context_dir = tmp_path / "context"
    modules_repo = tmp_path / "modules-repo"
    target = tmp_path / "elsewhere" / "x.md"
    assert (
        _tree_event_for_tool(
            "Read", {"file_path": str(target)}, context_dir, modules_repo
        )
        is None
    )
