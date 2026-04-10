"""Verify git_repo reads config from settings, not os.environ."""
import os
from unittest.mock import patch

import pytest


def _make_settings(**overrides):
    env = {"GH_OWNER": "test-owner", "GH_REPO": "test-repo", **overrides}
    with patch.dict(os.environ, env, clear=False):
        from src.config import Settings
        return Settings()


def test_default_remote_url_uses_settings():
    s = _make_settings(GH_OWNER="acme", GH_REPO="modules", GH_TOKEN="")
    with patch("src.services.git_repo.settings", s):
        from src.services.git_repo import _default_remote_url
        url = _default_remote_url()
        assert url == "https://github.com/acme/modules.git"


def test_default_remote_url_with_token():
    s = _make_settings(GH_OWNER="acme", GH_REPO="modules", GH_TOKEN="ghp_abc123")
    with patch("src.services.git_repo.settings", s):
        from src.services.git_repo import _default_remote_url
        url = _default_remote_url()
        assert "x-access-token:ghp_abc123@" in url


def test_resolve_clone_uses_settings():
    from src.config import settings
    from src.services.git_repo import _resolve_clone

    result = _resolve_clone(None)
    assert result == settings.MODULES_REPO_DIR
