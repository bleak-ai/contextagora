"""Tests for the centralized config module."""
import os
from pathlib import Path
from unittest.mock import patch

import pytest


def _make_settings(**overrides):
    """Create a fresh Settings instance with env overrides."""
    env = {
        "GH_OWNER": "test-owner",
        "GH_REPO": "test-repo",
        **overrides,
    }
    with patch.dict(os.environ, env, clear=False):
        from src.config import Settings
        return Settings()


class TestDefaults:
    def test_gh_branch_defaults_to_main(self):
        s = _make_settings()
        assert s.GH_BRANCH == "main"

    def test_gh_token_defaults_to_empty(self):
        s = _make_settings()
        assert s.GH_TOKEN == ""

    def test_port_defaults_to_8080(self):
        s = _make_settings()
        assert s.PORT == 8080

    def test_infisical_site_url_default(self):
        s = _make_settings()
        assert s.INFISICAL_SITE_URL == "https://app.infisical.com"


class TestDerivedPaths:
    def test_context_dir_is_under_base_dir(self):
        s = _make_settings()
        assert s.CONTEXT_DIR == s.BASE_DIR / "context"

    def test_static_dir_is_under_base_dir(self):
        s = _make_settings()
        assert s.STATIC_DIR == s.BASE_DIR / "static"

    def test_base_dir_points_to_src(self):
        s = _make_settings()
        assert s.BASE_DIR.name == "src"

    def test_default_modules_repo_dir(self):
        s = _make_settings()
        assert s.MODULES_REPO_DIR == s.BASE_DIR / "modules-repo"

    def test_modules_repo_dir_override(self):
        s = _make_settings(MODULES_REPO_DIR="/tmp/custom-repo")
        assert s.MODULES_REPO_DIR == Path("/tmp/custom-repo")


class TestConstants:
    def test_preserved_files(self):
        s = _make_settings()
        assert s.PRESERVED_FILES == {"CLAUDE.md"}

    def test_managed_files(self):
        s = _make_settings()
        assert s.MANAGED_FILES == {"llms.txt", ".env.schema", "requirements.txt"}


class TestEnvOverrides:
    def test_port_from_env(self):
        s = _make_settings(PORT="9090")
        assert s.PORT == 9090

    def test_gh_branch_from_env(self):
        s = _make_settings(GH_BRANCH="develop")
        assert s.GH_BRANCH == "develop"

    def test_infisical_site_url_from_env(self):
        s = _make_settings(INFISICAL_SITE_URL="https://custom.infisical.example.com")
        assert s.INFISICAL_SITE_URL == "https://custom.infisical.example.com"
