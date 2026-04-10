"""Centralized application configuration.

Every env var and derived path lives here. The rest of the app imports
`from src.config import settings` — never reads os.environ directly.
This module has zero imports from the rest of the app, which breaks
the circular import chain that previously forced server.py to define
constants above its router imports.
"""
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All platform configuration in one place."""

    # ── GitHub module source ──
    GH_OWNER: str = ""
    GH_REPO: str = ""
    GH_TOKEN: str = ""
    GH_BRANCH: str = "main"

    # ── Server ──
    PORT: int = 8080

    # ── Infisical ──
    INFISICAL_SITE_URL: str = "https://app.infisical.com"

    # ── Overridable paths ──
    MODULES_REPO_DIR: Path = Path("")  # resolved in validator

    # ── Derived (not from env) ──
    BASE_DIR: Path = Path("")  # resolved in validator
    CONTEXT_DIR: Path = Path("")  # resolved in validator
    STATIC_DIR: Path = Path("")  # resolved in validator

    # ── Constants (not from env) ──
    PRESERVED_FILES: frozenset[str] = frozenset({"CLAUDE.md"})
    MANAGED_FILES: frozenset[str] = frozenset({"llms.txt", "module.yaml"})

    @model_validator(mode="after")
    def _resolve_paths(self) -> "Settings":
        base = Path(__file__).resolve().parent
        object.__setattr__(self, "BASE_DIR", base)
        object.__setattr__(self, "CONTEXT_DIR", base / "context")
        object.__setattr__(self, "STATIC_DIR", base / "static")
        if not self.MODULES_REPO_DIR or self.MODULES_REPO_DIR == Path(""):
            object.__setattr__(self, "MODULES_REPO_DIR", base / "modules-repo")
        return self

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
