from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import pytest
from playwright.sync_api import Page

from e2e import scenarios
from src.services.modules import git_repo
from src.services.modules.manifest import ModuleManifest, write_manifest


@pytest.fixture
def seeded_module() -> str:
    """Create a throwaway integration module on disk; clean up if not deleted."""
    name = f"e2e-probe-{uuid.uuid4().hex[:8]}"
    module_dir: Path = git_repo.module_dir(name)

    git_repo.create_module_dir(name)
    write_manifest(module_dir, ModuleManifest(name=name, kind="integration"))
    git_repo.write_file(name, "info.md", f"# {name}\n\nE2E test probe module.\n")
    git_repo.write_file(name, "llms.txt", f"# {name}\n> E2E test probe\n\n- [info.md](info.md)\n")

    yield name

    if module_dir.exists():
        shutil.rmtree(module_dir)


def test_module_lifecycle(page: Page, app_url: str, seeded_module: str) -> None:
    name = seeded_module

    scenarios.open_app(page, app_url)
    page.reload(wait_until="domcontentloaded")

    scenarios.expect_module_visible(page, name)

    scenarios.delete_module(page, name)

    page.reload(wait_until="domcontentloaded")
    scenarios.expect_module_gone(page, name)
