"""Centralized application configuration.

Every env var and derived path lives here. The rest of the app imports
`from src.config import settings` — never reads os.environ directly.
This module has zero imports from the rest of the app, which breaks
the circular import chain that previously forced server.py to define
constants above its router imports.
"""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings

# Load .env into os.environ so subprocesses (e.g. varlock) inherit all vars,
# not just the ones Pydantic Settings knows about.
load_dotenv()


class Settings(BaseSettings):
    # GitHub module source
    GH_OWNER: str = ""
    GH_REPO: str = ""
    GH_TOKEN: str = ""
    GH_BRANCH: str = "main"

    # LLM
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""

    # Server
    PORT: int = 8080

    # Infisical (bootstrap credentials for varlock subprocesses)
    INFISICAL_SITE_URL: str = "https://app.infisical.com"
    INFISICAL_PROJECT_ID: str = ""
    INFISICAL_ENVIRONMENT: str = ""
    INFISICAL_CLIENT_ID: str = ""
    INFISICAL_CLIENT_SECRET: str = ""

    # Overridable paths
    MODULES_REPO_DIR: Path = Path("")  # resolved in validator

    # Derived (not from env)
    BASE_DIR: Path = Path("")  # resolved in validator
    CONTEXT_DIR: Path = Path("")  # resolved in validator
    STATIC_DIR: Path = Path("")  # resolved in validator

    # Constants (not from env)
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
