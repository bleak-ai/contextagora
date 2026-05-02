"""Shared test fixtures.

`patch_modules_repo` is the canonical way to redirect `MODULES_REPO_DIR`
to a tmp_path inside a test. It patches the `settings` attribute that
`git_repo` holds, which is what `git_repo.list_modules()` /
`git_repo.module_dir()` actually read. Patching `from src.config import
settings` directly inside a test is unreliable when another test (e.g.
`test_chat_recording.py::test_chat_stream_persists_user_and_assistant`)
has already done `importlib.reload(src.config)` — that reload creates a
new `settings` instance, but `git_repo` still holds a reference to the
original. Going through `git_repo.settings` gets the right one regardless.
"""
import pytest

from src.services.modules import git_repo


@pytest.fixture
def patch_modules_repo(tmp_path, monkeypatch):
    """Point git_repo at tmp_path. Returns the same tmp_path for convenience."""
    monkeypatch.setattr(git_repo.settings, "MODULES_REPO_DIR", tmp_path)
    return tmp_path
