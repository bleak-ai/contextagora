# Config Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered `os.getenv()` calls and the `server.py` constant-ordering hack with a single Pydantic Settings config module.

**Architecture:** Create `platform/src/config.py` with a `Settings` class (pydantic-settings `BaseSettings`) that holds every env var and derived path. All modules import `from src.config import settings` instead of reading env vars directly or importing constants from `server.py`. This breaks the circular import chain because `config.py` has zero imports from the rest of the app.

**Tech Stack:** pydantic-settings, pytest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `platform/src/config.py` | **Create** | `Settings` class + singleton `settings` instance |
| `platform/src/server.py` | **Modify** | Remove constants, remove import-ordering hack, import from config |
| `platform/src/services/git_repo.py` | **Modify** | Replace `os.environ.get(...)` with `settings.*` |
| `platform/src/services/schemas.py` | **Modify** | Replace `os.environ.get(...)` with `settings.*` |
| `platform/src/routes/chat.py` | **Modify** | Import `CONTEXT_DIR` from config, not server |
| `platform/src/routes/workspace.py` | **Modify** | Import constants from config, not server |
| `platform/src/routes/modules.py` | **Modify** | Import `MANAGED_FILES` from config, not server |
| `platform/src/routes/files.py` | **Modify** | Import `CONTEXT_DIR` from config, not server |
| `platform/src/routes/root_context.py` | **Modify** | Import `CONTEXT_DIR` from config, not server |
| `platform/src/services/benchmarks/runner.py` | **Modify** | Replace lazy `from src.server import CONTEXT_DIR` with config import |
| `platform/src/services/schemas.py` | **Modify** | Update `managed_files` param type to `AbstractSet[str]` |
| `platform/src/services/git_repo.py` | **Modify** | Update `managed_files` param type to `AbstractSet[str]` |
| `platform/src/services/workspace_inspect.py` | **Modify** | Update `managed_files` param type to `AbstractSet[str]` |
| `platform/pyproject.toml` | **Modify** | Add `pydantic-settings` dependency |
| `platform/tests/test_config.py` | **Create** | Tests for config loading, defaults, validation |

---

### Task 1: Add pydantic-settings dependency

**Files:**
- Modify: `platform/pyproject.toml:6-12`

- [ ] **Step 1: Add pydantic-settings to dependencies**

In `platform/pyproject.toml`, add `"pydantic-settings"` to the `dependencies` list:

```toml
dependencies = [
    "fastapi",
    "python-multipart",
    "uvicorn",
    "httpx",
    "pyyaml>=6.0.3",
    "pydantic-settings",
]
```

- [ ] **Step 2: Install**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv sync`
Expected: installs pydantic-settings and its deps successfully.

- [ ] **Step 3: Verify import works**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "from pydantic_settings import BaseSettings; print('ok')"`
Expected: prints `ok`

---

### Task 2: Create config.py with Settings class and tests

**Files:**
- Create: `platform/src/config.py`
- Create: `platform/tests/__init__.py`
- Create: `platform/tests/test_config.py`

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/__init__.py` (empty file).

Create `platform/tests/test_config.py`:

```python
"""Tests for the centralized config module."""
import os
from pathlib import Path
from unittest.mock import patch

import pytest


def _make_settings(**overrides):
    """Create a fresh Settings instance with env overrides.

    Always sets the required GH vars so tests don't fail on missing env.
    """
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
        # BASE_DIR should be the directory containing config.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.config'`

- [ ] **Step 3: Write the config module**

Create `platform/src/config.py`:

```python
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
    MANAGED_FILES: frozenset[str] = frozenset({"llms.txt", ".env.schema", "requirements.txt"})

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/test_config.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add platform/src/config.py platform/tests/__init__.py platform/tests/test_config.py platform/pyproject.toml
git commit -m "feat(config): add centralized Settings via pydantic-settings"
```

---

### Task 3: Migrate git_repo.py to use settings

**Files:**
- Modify: `platform/src/services/git_repo.py:1-25`
- Create: `platform/tests/test_git_repo_config.py`

- [ ] **Step 1: Write the failing test**

Create `platform/tests/test_git_repo_config.py`:

```python
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
    """_default_remote_url should use settings.GH_OWNER / GH_REPO."""
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/test_git_repo_config.py -v`
Expected: FAIL — git_repo still reads from `os.environ`, not settings

- [ ] **Step 3: Update git_repo.py**

Replace the config section at the top of `platform/src/services/git_repo.py` (lines 1-25):

```python
"""Local git clone service.

Wraps every git operation used by the platform so that module CRUD reads
and writes from a local checkout instead of the GitHub API.
"""
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

from src.config import settings

log = logging.getLogger(__name__)

# Regex to strip "x-access-token:XXXX@" from URLs before logging
_TOKEN_IN_URL = re.compile(r"(https://)x-access-token:[^@]*@")
```

Update `_run` — keep `{**os.environ, ...}` for the subprocess env (this is intentional: git needs the full process env, not just our config vars):

No change needed to `_run`.

Update `_default_remote_url`:

```python
def _default_remote_url() -> str:
    if not (settings.GH_OWNER and settings.GH_REPO):
        raise GitRepoError("GH_OWNER and GH_REPO must be set")
    if settings.GH_TOKEN:
        return f"https://x-access-token:{settings.GH_TOKEN}@github.com/{settings.GH_OWNER}/{settings.GH_REPO}.git"
    return f"https://github.com/{settings.GH_OWNER}/{settings.GH_REPO}.git"
```

Update `_resolve_clone`:

```python
def _resolve_clone(clone_dir: Path | None) -> Path:
    return Path(clone_dir) if clone_dir else settings.MODULES_REPO_DIR
```

Update `init_repo` — replace `MODULES_REPO_DIR` with `settings.MODULES_REPO_DIR` and `GH_BRANCH` with `settings.GH_BRANCH`:

```python
def init_repo(
    *,
    remote_url: str | None = None,
    branch: str | None = None,
    clone_dir: Path | None = None,
) -> None:
    """Delete any existing clone and perform a fresh single-branch clone."""
    url = remote_url or _default_remote_url()
    br = branch or settings.GH_BRANCH
    target = Path(clone_dir) if clone_dir else settings.MODULES_REPO_DIR

    if target.exists():
        resolved = target.resolve()
        default_dir = (Path(__file__).resolve().parent.parent / "modules-repo").resolve()
        is_default = resolved == default_dir
        looks_like_clone = (resolved / ".git").is_dir()
        if not (is_default or looks_like_clone):
            raise GitRepoError(
                f"Refusing to remove {resolved}: not the default clone dir "
                f"and does not contain a .git directory. Set MODULES_REPO_DIR "
                f"to an empty or default path."
            )
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)

    try:
        _run([
            "git", "clone",
            "--single-branch", "--branch", br,
            url,
            str(target),
        ])
    except GitRepoError:
        log.exception("Failed to clone modules repo")
        raise
```

Remove the old module-level constants `GH_OWNER`, `GH_REPO`, `GH_TOKEN`, `GH_BRANCH`, `_DEFAULT_CLONE_DIR`, `MODULES_REPO_DIR`.

Note: `MODULES_REPO_DIR` was imported in `server.py:61` for logging. That reference will be updated in Task 5. For now the import will be `settings.MODULES_REPO_DIR`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/test_git_repo_config.py tests/test_config.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/git_repo.py platform/tests/test_git_repo_config.py
git commit -m "refactor(git_repo): read config from settings instead of os.environ"
```

---

### Task 4: Migrate schemas.py to use settings

**Files:**
- Modify: `platform/src/services/schemas.py:1-6`

- [ ] **Step 1: Update schemas.py**

Replace the env var read at the top of `platform/src/services/schemas.py`:

Old (lines 1-6):
```python
import os
import re
from pathlib import Path

INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"
INFISICAL_SITE_URL = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com")
```

New:
```python
import re
from pathlib import Path

from src.config import settings

INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"
```

Then in `generate_global_schema`, replace `INFISICAL_SITE_URL` with `settings.INFISICAL_SITE_URL` (one occurrence, line 103):

```python
        f"#   siteUrl={settings.INFISICAL_SITE_URL}",
```

- [ ] **Step 2: Run existing config tests still pass**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/ -v`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add platform/src/services/schemas.py
git commit -m "refactor(schemas): read INFISICAL_SITE_URL from settings"
```

---

### Task 5: Migrate server.py — remove constants, fix import ordering

**Files:**
- Modify: `platform/src/server.py`

This is the key task. After this, `server.py` is clean: no constants, no import-ordering hack, no `list_modules` utility function.

- [ ] **Step 1: Rewrite server.py**

Replace the entire contents of `platform/src/server.py` with:

```python
import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from src.config import settings
from src.routes.benchmarks import router as benchmarks_router
from src.routes.chat import router as chat_router
from src.routes.commands import router as commands_router
from src.routes.files import router as files_router
from src.routes.health import router as health_router
from src.routes.modules import router as modules_router
from src.routes.root_context import router as root_context_router
from src.routes.sync import router as sync_router
from src.routes.workspace import router as workspace_router
from src.services import git_repo

log = logging.getLogger(__name__)

settings.CONTEXT_DIR.mkdir(exist_ok=True)

app = FastAPI()

app.include_router(health_router)
app.include_router(modules_router)
app.include_router(workspace_router)
app.include_router(chat_router)
app.include_router(files_router)
app.include_router(commands_router)
app.include_router(sync_router)
app.include_router(benchmarks_router)
app.include_router(root_context_router)


@app.on_event("startup")
def _bootstrap_modules_repo() -> None:
    try:
        git_repo.init_repo()
        log.info("Modules repo cloned at %s", settings.MODULES_REPO_DIR)
    except git_repo.GitRepoError as exc:
        log.error("Failed to init modules repo: %s", exc)


if settings.STATIC_DIR.exists():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(settings.STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve index.html for all non-API routes (SPA client-side routing)."""
        file_path = settings.STATIC_DIR / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(settings.STATIC_DIR / "index.html")


def main():
    import uvicorn
    uvicorn.run("src.server:app", host="0.0.0.0", port=settings.PORT, reload=True)


if __name__ == "__main__":
    main()
```

Key changes:
- No more `CONTEXT_DIR`, `MANAGED_FILES`, `PRESERVED_FILES`, `list_modules` defined here
- Imports are at the top — no `# noqa: E402` hack
- `import os` removed entirely
- `STATIC_DIR`, `BASE_DIR` come from settings

- [ ] **Step 2: Verify the app module can be imported**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "from src.config import settings; print(settings.CONTEXT_DIR)"`
Expected: prints the path to context dir, no import errors.

Note: Full `from src.server import app` will fail until all routes are migrated in Task 6. That's fine — we do them next.

- [ ] **Step 3: Commit**

```bash
git add platform/src/server.py
git commit -m "refactor(server): remove constants, import from config"
```

---

### Task 6: Migrate all routes to import from config

**Files:**
- Modify: `platform/src/routes/chat.py:12`
- Modify: `platform/src/routes/workspace.py:8`
- Modify: `platform/src/routes/modules.py:19`
- Modify: `platform/src/routes/files.py:7`
- Modify: `platform/src/routes/root_context.py:4`
- Modify: `platform/src/services/benchmarks/runner.py:51`

- [ ] **Step 1: Update routes/chat.py**

Replace:
```python
from src.server import CONTEXT_DIR
```
With:
```python
from src.config import settings
```

Then replace all `CONTEXT_DIR` references with `settings.CONTEXT_DIR` (3 occurrences: lines 46, 79, 150).

- [ ] **Step 2: Update routes/workspace.py**

Replace:
```python
from src.server import CONTEXT_DIR, MANAGED_FILES, PRESERVED_FILES, list_modules
```
With:
```python
from src.config import settings
```

Then:
- Replace `CONTEXT_DIR` with `settings.CONTEXT_DIR` throughout
- Replace `MANAGED_FILES` with `settings.MANAGED_FILES` throughout
- Replace `PRESERVED_FILES` with `settings.PRESERVED_FILES` throughout
- Replace `git_repo.MODULES_REPO_DIR` with `settings.MODULES_REPO_DIR` (2 occurrences: lines 91 and 115)
- Replace `list_modules(CONTEXT_DIR)` with `_list_modules(settings.CONTEXT_DIR)` — add a local helper at the top of the file:

```python
def _list_modules(directory):
    """Return sorted names of subdirectories (each subdir = one module)."""
    return sorted(
        p.name for p in directory.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )
```

This replaces the `list_modules` that was previously imported from `server.py`. It's a 3-line function used only here and in `secrets.py` (passed as a callback), so a local definition is cleaner than a shared utility module.

- Also update the `get_secrets_status` callback on line 170 — change `list_modules` to `_list_modules`:
```python
_secrets_cache = await get_secrets_status(settings.CONTEXT_DIR, _list_modules)
```

- [ ] **Step 3: Update routes/modules.py**

Replace:
```python
from src.server import MANAGED_FILES
```
With:
```python
from src.config import settings
```

Then replace all `MANAGED_FILES` references with `settings.MANAGED_FILES` throughout the file (use find-and-replace).

- [ ] **Step 4: Update routes/files.py**

Replace:
```python
from src.server import CONTEXT_DIR
```
With:
```python
from src.config import settings
```

Then replace `CONTEXT_DIR` with `settings.CONTEXT_DIR` (2 occurrences: line 15 `_context_resolved` assignment, and line 25 in `_validate_path`).

- [ ] **Step 5: Update routes/root_context.py**

Replace:
```python
from src.server import CONTEXT_DIR
```
With:
```python
from src.config import settings
```

Then replace `CONTEXT_DIR` with `settings.CONTEXT_DIR` (1 occurrence, line 23).

- [ ] **Step 6: Update services/benchmarks/runner.py**

Replace the lazy import at line 51:
```python
    from src.server import CONTEXT_DIR
```
With a top-level import:
```python
from src.config import settings
```

Add this at the top of the file (with other imports), then replace all `CONTEXT_DIR` references in the function body with `settings.CONTEXT_DIR` (4 occurrences: lines 69, 112, 129, 130).

- [ ] **Step 7: Verify full app imports cleanly**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "from src.server import app; print('ok')"`
Expected: prints `ok` — no circular imports, no missing references.

- [ ] **Step 8: Run all tests**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/ -v`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add platform/src/routes/chat.py platform/src/routes/workspace.py platform/src/routes/modules.py platform/src/routes/files.py platform/src/routes/root_context.py platform/src/services/benchmarks/runner.py
git commit -m "refactor(routes): import config from settings, not server"
```

---

### Task 7: Fix frozenset/set type annotations

**Files:**
- Modify: `platform/src/services/schemas.py` — `validate_module_file_path` signature
- Modify: `platform/src/services/git_repo.py` — `list_module_files` signature
- Modify: `platform/src/services/workspace_inspect.py` — `list_workspace_files` signature
- Modify: `platform/src/llms.py` — `regenerate_module_llms_txt` signature

Settings uses `frozenset[str]` for `MANAGED_FILES` (immutable constants shouldn't be `set`). Functions that receive it need compatible type hints.

- [ ] **Step 1: Update type annotations**

In each file, change `managed_files: set[str]` to `managed_files: frozenset[str]` in the function signatures:

- `platform/src/services/schemas.py:26` — `validate_module_file_path(file_path: str, managed_files: frozenset[str])`
- `platform/src/services/git_repo.py:132` — `list_module_files(module: str, managed_files: frozenset[str], ...)`
- `platform/src/services/workspace_inspect.py:12` — `list_workspace_files(module_dir: Path, managed_files: frozenset[str])`
- `platform/src/llms.py:44` — `regenerate_module_llms_txt(name: str, managed_files: frozenset[str], ...)`

- [ ] **Step 2: Run tests**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/ -v`
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add platform/src/services/schemas.py platform/src/services/git_repo.py platform/src/services/workspace_inspect.py platform/src/llms.py
git commit -m "refactor: update managed_files type hints to frozenset[str]"
```

---

### Task 8: Cleanup — verify no remaining os.getenv in platform code

**Files:** None (verification only)

- [ ] **Step 1: Search for remaining os.getenv/os.environ in platform src**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader && grep -rn "os\.getenv\|os\.environ" platform/src/ --include="*.py" | grep -v modules-repo | grep -v benchmarks/runs | grep -v prompts/ | grep -v context/ | grep -v __pycache__`

Expected remaining hits (these are intentional — they pass the full process env to subprocesses, not reading config):
- `services/git_repo.py` — `{**os.environ, "GIT_TERMINAL_PROMPT": "0"}` in `_run()`
- `routes/chat.py` — `{**os.environ}` in the subprocess env
- `routes/modules.py` — `{**os.environ, ...}` in subprocess env for generate/detect-packages

These are correct: subprocesses need the full env (PATH, HOME, etc.), not just our config vars.

- [ ] **Step 2: Verify no imports from src.server remain (except app itself)**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader && grep -rn "from src\.server import" platform/src/ --include="*.py" | grep -v __pycache__`

Expected: zero results.

- [ ] **Step 3: Run full test suite one last time**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run pytest tests/ -v`
Expected: all pass

- [ ] **Step 4: Commit (if any cleanup was needed)**

Only if steps 1-2 revealed issues that needed fixing.
