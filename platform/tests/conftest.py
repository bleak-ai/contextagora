"""Pytest configuration and fixtures for the platform test suite."""
import os

import pytest


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Remove real secrets from the environment for every test.

    Tests that need specific values set them explicitly via patch.dict or
    the _make_settings helper.  Without this, developer shell env vars
    (GH_TOKEN, INFISICAL_SITE_URL, …) bleed into Settings instances and
    break default-value assertions.
    """
    for var in (
        "GH_TOKEN",
        "GH_OWNER",
        "GH_REPO",
        "GH_BRANCH",
        "INFISICAL_SITE_URL",
        "PORT",
        "MODULES_REPO_DIR",
    ):
        monkeypatch.delenv(var, raising=False)
