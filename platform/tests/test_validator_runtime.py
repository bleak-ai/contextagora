"""Tests for the validator runtime wrapper.

These exercise the in-process per-module validator that the chat route
calls after each turn. The wrapper translates `validate_modules.py`'s
`list[Issue]` into a structured `ValidationReport`.

We use the shared `patch_modules_repo` fixture (see tests/conftest.py)
because patching `src.config.settings.MODULES_REPO_DIR` directly is
unreliable when other tests have already reloaded `src.config` —
`git_repo` keeps a reference to its original `settings` instance.
"""
from pathlib import Path

from src.services.modules.validator_runtime import validate_module


def _write_module(modules_repo: Path, name: str, files: dict[str, str]) -> None:
    mod = modules_repo / name
    mod.mkdir(parents=True)
    for fname, content in files.items():
        (mod / fname).write_text(content)


def test_valid_module_returns_no_errors(patch_modules_repo):
    _write_module(patch_modules_repo, "stripe", {
        "module.yaml": "name: stripe\nkind: integration\n",
        "llms.txt": "# stripe\n> Stripe integration\n\n- [info.md](info.md)\n",
        "info.md": "# Stripe\n\nIntegration docs.\n",
    })
    report = validate_module("stripe")
    assert report.errors == []


def test_missing_llms_txt_returns_error(patch_modules_repo):
    _write_module(patch_modules_repo, "broken", {
        "module.yaml": "name: broken\nkind: integration\n",
    })
    report = validate_module("broken")
    assert any("llms.txt" in e.lower() for e in report.errors)


def test_unknown_module_returns_error(patch_modules_repo):
    report = validate_module("nope")
    assert report.errors
