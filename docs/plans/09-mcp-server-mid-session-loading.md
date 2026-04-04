# MCP Server + Mid-Session Module Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI agent discover and load modules mid-conversation via an MCP server, eliminating the need for users to leave chat and reload modules manually.

**Architecture:** A Python MCP server runs alongside the existing FastAPI app inside the container. Both coordinate through a shared `.modules.json` state file in `/context/`. The FastAPI server writes state at initial load, the MCP server reads/writes it for mid-session operations. The agent connects to the MCP server via stdio and gains tools like `list_modules()`, `load_module()`, and `get_module_summary()`.

**Tech Stack:** Python 3.12, `mcp` SDK (PyPI), existing FastAPI server, Varlock, GitHub API (via existing `httpx` helpers)

---

## File Structure

```
platform/
├── src/
│   ├── server.py              # MODIFY — write .modules.json on /load, extract shared helpers
│   ├── modules_core.py        # CREATE — shared module logic (GitHub fetch, schema augment, state file)
│   ├── mcp_server.py          # CREATE — MCP server exposing tools to the agent
│   └── context/
│       └── .modules.json      # CREATE (at runtime) — shared state file
├── tests/
│   ├── test_modules_core.py   # CREATE — tests for shared module logic
│   └── test_mcp_server.py     # CREATE — tests for MCP server tools
├── pyproject.toml             # MODIFY — add mcp dependency + mcp entry point
└── deploy/
    └── Dockerfile             # MODIFY — add .mcp.json for Claude Code
```

**Key design decision:** Extract shared logic (GitHub API, module download, schema augmentation, state file I/O) from `server.py` into `modules_core.py`. Both `server.py` and `mcp_server.py` import from it. No logic duplication.

---

## Task 0: Set up test infrastructure

**Files:**
- Modify: `platform/pyproject.toml`
- Create: `platform/tests/__init__.py`

**Why first:** Tests need pytest available and a `tests/` package that can import `src.*`.

- [ ] **Step 1: Add pytest as a dev dependency**

```toml
# Add to pyproject.toml
[dependency-groups]
dev = ["pytest"]
```

- [ ] **Step 2: Create the tests directory and `__init__.py`**

```bash
mkdir -p platform/tests
touch platform/tests/__init__.py
```

- [ ] **Step 3: Sync dependencies**

Run: `cd platform && uv sync`

- [ ] **Step 4: Commit**

```bash
git add platform/pyproject.toml platform/uv.lock platform/tests/__init__.py
git commit -m "chore: add pytest and tests directory"
```

---

## Task 1: Extract shared module logic into `modules_core.py`

**Files:**
- Create: `platform/src/modules_core.py`
- Modify: `platform/src/server.py`
- Create: `platform/tests/test_modules_core.py`

**Why first:** Both the FastAPI server and the MCP server need the same GitHub fetching, module downloading, schema augmentation, and state file logic. Extract it now so neither duplicates the other.

- [ ] **Step 1: Write tests for the state file read/write functions**

```python
# platform/tests/test_modules_core.py
import json
from pathlib import Path
from src.modules_core import read_state, write_state, add_module_to_state, remove_module_from_state

def test_read_state_missing_file(tmp_path):
    """Returns empty state when .modules.json doesn't exist."""
    state = read_state(tmp_path)
    assert state == {"loaded": {}, "available": []}

def test_write_and_read_state(tmp_path):
    """Round-trips state through JSON file."""
    state = {
        "loaded": {
            "linear": {"loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user", "has_secrets": True}
        },
        "available": [
            {"name": "jira", "type": "integration", "description": "Jira project management"}
        ],
    }
    write_state(tmp_path, state)
    assert (tmp_path / ".modules.json").exists()
    assert read_state(tmp_path) == state

def test_add_module_to_state(tmp_path):
    """Adds a module to the loaded set and removes from available."""
    state = {
        "loaded": {},
        "available": [
            {"name": "linear", "type": "integration", "description": "Linear issue tracking"},
            {"name": "jira", "type": "integration", "description": "Jira PM"},
        ],
    }
    write_state(tmp_path, state)
    add_module_to_state(tmp_path, "linear", loaded_by="agent", has_secrets=True)
    result = read_state(tmp_path)
    assert "linear" in result["loaded"]
    assert result["loaded"]["linear"]["loaded_by"] == "agent"
    assert all(m["name"] != "linear" for m in result["available"])

def test_remove_module_from_state(tmp_path):
    """Removes a module from loaded and adds back to available."""
    state = {
        "loaded": {
            "linear": {"loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user", "has_secrets": False}
        },
        "available": [],
    }
    write_state(tmp_path, state)
    remove_module_from_state(tmp_path, "linear")
    result = read_state(tmp_path)
    assert "linear" not in result["loaded"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_modules_core.py -v`
Expected: FAIL — `modules_core` doesn't exist yet

- [ ] **Step 3: Implement `modules_core.py`**

```python
# platform/src/modules_core.py
"""Shared module logic used by both the FastAPI server and the MCP server."""

import base64
import json
import logging
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
CONTEXT_DIR = BASE_DIR / "context"
CONTEXT_DIR.mkdir(exist_ok=True)
MODULES_DIR = Path(os.environ.get("MODULES_DIR", BASE_DIR.parent.parent / "modules"))
PRESERVED_FILES = {"CLAUDE.md", ".modules.json"}

# --- GitHub config ---
GH_OWNER = os.environ.get("GH_OWNER")
GH_REPO = os.environ.get("GH_REPO")
GH_TOKEN = os.environ.get("GH_TOKEN")

_modules_cache: list[str] = []
_modules_cache_ts: float = 0
_CACHE_TTL = 60


def invalidate_module_cache() -> None:
    """Reset the module cache so the next list_available_modules() call hits GitHub."""
    global _modules_cache_ts
    _modules_cache_ts = 0

# --- Infisical config ---
INFISICAL_SITE_URL = os.environ.get("INFISICAL_SITE_URL", "https://app.infisical.com")
VARLOCK_INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"

_VALID_MODULE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
_MAX_DOWNLOAD_DEPTH = 10
INFISICAL_VARS = {"INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT", "INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET"}

STATE_FILE = ".modules.json"


# --- GitHub helpers (moved from server.py) ---

def _gh_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GH_TOKEN:
        headers["Authorization"] = f"Bearer {GH_TOKEN}"
    return headers


def _gh_api(path: str) -> list | dict:
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.get(url, headers=_gh_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_create_file(path: str, content: str, message: str) -> dict:
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=_gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_update_file(path: str, content: str, sha: str, message: str) -> dict:
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.put(url, headers=_gh_headers(), json={
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "sha": sha,
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_delete_file(path: str, sha: str, message: str) -> dict:
    url = f"https://api.github.com/repos/{GH_OWNER}/{GH_REPO}/contents/{path}"
    resp = httpx.request("DELETE", url, headers=_gh_headers(), json={
        "message": message,
        "sha": sha,
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _gh_delete_dir(path: str) -> None:
    items = _gh_api(path)
    for item in items:
        if item["type"] == "file":
            _gh_delete_file(item["path"], item["sha"], f"Delete {item['path']}")
        elif item["type"] == "dir":
            _gh_delete_dir(item["path"])


# --- Module operations ---

def validate_module_name(name: str) -> str:
    name = name.strip()
    if not name or not _VALID_MODULE_NAME.match(name):
        raise ValueError(f"Invalid module name: '{name}'. Use only letters, numbers, hyphens, underscores.")
    return name


def list_remote_modules(*, bypass_cache: bool = False) -> list[str]:
    global _modules_cache, _modules_cache_ts
    if not GH_OWNER:
        return []
    if not bypass_cache and _modules_cache and (time.monotonic() - _modules_cache_ts) < _CACHE_TTL:
        return _modules_cache
    items = _gh_api("")
    _modules_cache = sorted(item["name"] for item in items if item["type"] == "dir")
    _modules_cache_ts = time.monotonic()
    return _modules_cache


def list_available_modules(*, bypass_cache: bool = False) -> list[str]:
    if GH_OWNER:
        try:
            return list_remote_modules(bypass_cache=bypass_cache)
        except httpx.HTTPError as exc:
            log.error("Failed to list modules from GitHub: %s", exc)
            return _modules_cache if _modules_cache else []
    return list_local_modules(MODULES_DIR)


def list_local_modules(directory: Path) -> list[str]:
    return sorted(p.name for p in directory.iterdir() if p.is_dir())


def download_module(name: str, dest: Path, *, _depth: int = 0) -> None:
    if _depth > _MAX_DOWNLOAD_DEPTH:
        raise ValueError(f"Module directory too deeply nested (>{_MAX_DOWNLOAD_DEPTH} levels)")
    dest.mkdir(parents=True, exist_ok=True)
    items = _gh_api(name)
    for item in items:
        target = dest / item["name"]
        if item["type"] == "file":
            content_resp = _gh_api(f"{name}/{item['name']}")
            target.write_bytes(base64.b64decode(content_resp["content"]))
        elif item["type"] == "dir":
            download_module(f"{name}/{item['name']}", target, _depth=_depth + 1)


def augment_schema(schema_text: str, module_name: str) -> str:
    header_lines = []
    separator_seen = False
    body_lines = []

    for line in schema_text.splitlines():
        if not separator_seen:
            if line.strip() == "# ---":
                separator_seen = True
            header_lines.append(line)
        else:
            body_lines.append(line)

    if not separator_seen:
        body_lines = header_lines
        header_lines = ["# ---"]

    augmented_body = []
    for line in body_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, value = stripped.split("=", 1)
            if not value:
                augmented_body.append(f"{key}=infisical()")
            else:
                augmented_body.append(line)
        else:
            augmented_body.append(line)

    infisical_header = f"""# @import(../../.env.schema)
# @plugin({VARLOCK_INFISICAL_PLUGIN})
# @initInfisical(
#   projectId=$INFISICAL_PROJECT_ID,
#   environment=$INFISICAL_ENVIRONMENT,
#   clientId=$INFISICAL_CLIENT_ID,
#   clientSecret=$INFISICAL_CLIENT_SECRET,
#   secretPath=/{module_name},
#   siteUrl={INFISICAL_SITE_URL}
# )"""

    parts = [infisical_header]
    parts.extend(header_lines)
    parts.extend(augmented_body)
    return "\n".join(parts) + "\n"


def _generate_env_schema(var_names: list[str]) -> str:
    lines = ["# ---"]
    for var in var_names:
        lines.append("# @required @sensitive @type=string")
        lines.append(f"{var}=")
    return "\n".join(lines) + "\n"


def _parse_env_schema(schema_text: str) -> list[str]:
    return [
        line.split("=", 1)[0]
        for line in schema_text.splitlines()
        if line.strip() and not line.strip().startswith("#") and "=" in line
    ]


def get_secrets_status(directory: Path) -> dict[str, dict[str, str | None]]:
    status = {}
    for mod in list_local_modules(directory):
        schema_file = directory / mod / ".env.schema"
        if not schema_file.exists():
            continue
        var_names = []
        for line in schema_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                name = line.split("=")[0]
                if name not in INFISICAL_VARS:
                    var_names.append(name)
        mod_path = str(directory / mod)
        status[mod] = {}
        for var in var_names:
            result = subprocess.run(
                ["varlock", "printenv", "--path", mod_path, var],
                capture_output=True, text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                value = result.stdout.strip()
                status[mod][var] = value[:2] + "▒" * 5
            else:
                status[mod][var] = None
    return status


# --- State file (.modules.json) ---

def read_state(context_dir: Path) -> dict:
    state_path = context_dir / STATE_FILE
    if not state_path.exists():
        return {"loaded": {}, "available": []}
    return json.loads(state_path.read_text())


def write_state(context_dir: Path, state: dict) -> None:
    state_path = context_dir / STATE_FILE
    state_path.write_text(json.dumps(state, indent=2) + "\n")


def build_full_state(context_dir: Path) -> dict:
    """Build state from current disk + registry. Used after bulk /load."""
    loaded_names = list_local_modules(context_dir)
    all_available = list_available_modules()

    loaded = {}
    now = datetime.now(timezone.utc).isoformat()
    for name in loaded_names:
        has_secrets = (context_dir / name / ".env.schema").exists()
        loaded[name] = {
            "loaded_at": now,
            "loaded_by": "user",
            "has_secrets": has_secrets,
        }

    available = [
        {"name": name, "type": "unknown", "description": ""}
        for name in all_available if name not in loaded
    ]

    return {"loaded": loaded, "available": available}


def add_module_to_state(context_dir: Path, name: str, *, loaded_by: str = "agent", has_secrets: bool = False) -> None:
    state = read_state(context_dir)
    now = datetime.now(timezone.utc).isoformat()
    state["loaded"][name] = {
        "loaded_at": now,
        "loaded_by": loaded_by,
        "has_secrets": has_secrets,
    }
    state["available"] = [m for m in state["available"] if m["name"] != name]
    write_state(context_dir, state)


def remove_module_from_state(context_dir: Path, name: str) -> None:
    state = read_state(context_dir)
    if name in state["loaded"]:
        del state["loaded"][name]
    state["available"].append({"name": name, "type": "unknown", "description": ""})
    write_state(context_dir, state)


# --- Single-module load (used by MCP for mid-session loading) ---

def load_single_module(name: str, context_dir: Path) -> dict:
    """Download a single module into context_dir, augment schema, validate secrets.

    Returns a dict with module info and the content of info.md (summary).
    Raises ValueError if the module is not available or already loaded.
    """
    name = validate_module_name(name)
    module_dest = context_dir / name

    if module_dest.exists():
        raise ValueError(f"Module '{name}' is already loaded")

    available = set(list_available_modules())
    if name not in available:
        raise ValueError(f"Module '{name}' not found in registry")

    # Download
    if GH_OWNER:
        download_module(name, module_dest)
    else:
        import shutil
        shutil.copytree(MODULES_DIR / name, module_dest)

    # Augment schema
    schema_file = module_dest / ".env.schema"
    has_secrets = False
    if schema_file.exists():
        original = schema_file.read_text()
        schema_file.write_text(augment_schema(original, name))
        has_secrets = True
        # Validate secrets
        result = subprocess.run(
            ["varlock", "load", "--format", "json", "--path", str(module_dest)],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            log.warning("varlock: %s has missing secrets:\n%s\n%s", name, result.stderr, result.stdout)

    # Update state
    add_module_to_state(context_dir, name, loaded_by="agent", has_secrets=has_secrets)

    # Read summary
    info_file = module_dest / "info.md"
    summary = info_file.read_text() if info_file.exists() else f"Module '{name}' loaded (no info.md found)"

    return {"name": name, "has_secrets": has_secrets, "summary": summary}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_modules_core.py -v`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/modules_core.py platform/tests/test_modules_core.py
git commit -m "feat: extract shared module logic into modules_core.py"
```

---

## Task 2: Migrate `server.py` to use `modules_core`

**Files:**
- Modify: `platform/src/server.py`

**Why:** Remove duplicated logic from `server.py`. It should import everything from `modules_core` and only contain FastAPI route handlers.

- [ ] **Step 1: Rewrite `server.py` to import from `modules_core`**

Replace all the module logic in `server.py` with imports from `modules_core`. The file should shrink significantly. Keep only:
- FastAPI app setup and route handlers
- The `_secrets_cache` global (UI-specific state)
- The chat/run endpoints
- The registry CRUD routes

Key changes:
```python
# server.py — top of file
from src.modules_core import (
    CONTEXT_DIR, MODULES_DIR, PRESERVED_FILES,
    list_available_modules, list_local_modules, download_module,
    augment_schema, get_secrets_status, validate_module_name,
    invalidate_module_cache,
    _gh_api, _gh_create_file, _gh_update_file, _gh_delete_file, _gh_delete_dir,
    _generate_env_schema, _parse_env_schema,
    build_full_state, write_state,
)
```

**Important:** Replace all `_modules_cache_ts = 0` occurrences in server.py with `invalidate_module_cache()` (used in registry create/delete handlers). Also replace all `list_modules(CONTEXT_DIR)` calls with `list_local_modules(CONTEXT_DIR)`.

In the `load()` route handler, add one line after modules are loaded:
```python
    # Write .modules.json state file
    write_state(CONTEXT_DIR, build_full_state(CONTEXT_DIR))
```

- [ ] **Step 2: Verify the web UI still works**

Run: `cd platform && uv run start`
Then manually test:
1. Open `http://localhost:8080`
2. Select modules → click Load
3. Verify modules load and secrets display
4. Check that `platform/src/context/.modules.json` was created

- [ ] **Step 3: Commit**

```bash
git add platform/src/server.py
git commit -m "refactor: migrate server.py to use shared modules_core"
```

---

## Task 3: Add `mcp` dependency and entry point

**Files:**
- Modify: `platform/pyproject.toml`

- [ ] **Step 1: Add the `mcp` package to dependencies**

Add `"mcp[cli]"` to the `dependencies` list in `pyproject.toml`:

```toml
dependencies = [
    "fastapi",
    "uvicorn",
    "jinja2",
    "python-multipart",
    "httpx",
    "mcp[cli]",
]
```

Add the MCP server entry point to `[project.scripts]`:

```toml
[project.scripts]
start = "src.server:main"
mcp-server = "src.mcp_server:main"
```

- [ ] **Step 2: Lock dependencies**

Run: `cd platform && uv sync`
Expected: `uv.lock` updated, `mcp` installed

- [ ] **Step 3: Commit**

```bash
git add platform/pyproject.toml platform/uv.lock
git commit -m "feat: add mcp SDK dependency and entry point"
```

---

## Task 4: Build the MCP server with `list_modules` tool

**Files:**
- Create: `platform/src/mcp_server.py`
- Create: `platform/tests/test_mcp_server.py`

- [ ] **Step 1: Write test for `list_modules` tool**

```python
# platform/tests/test_mcp_server.py
import json
from pathlib import Path
from unittest.mock import patch
from src.modules_core import write_state


def test_list_modules_returns_loaded_and_available(tmp_path):
    """list_modules tool returns state from .modules.json."""
    from src.mcp_server import _handle_list_modules

    state = {
        "loaded": {
            "linear": {"loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user", "has_secrets": True}
        },
        "available": [
            {"name": "jira", "type": "integration", "description": "Jira PM"}
        ],
    }
    write_state(tmp_path, state)

    result = _handle_list_modules(tmp_path)
    assert "linear" in result["loaded"]
    assert result["loaded"]["linear"]["loaded_by"] == "user"
    assert len(result["available"]) == 1
    assert result["available"][0]["name"] == "jira"


def test_list_modules_empty_state(tmp_path):
    """Returns empty state when no .modules.json exists."""
    from src.mcp_server import _handle_list_modules

    result = _handle_list_modules(tmp_path)
    assert result == {"loaded": {}, "available": []}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_mcp_server.py -v`
Expected: FAIL — `mcp_server` doesn't exist

- [ ] **Step 3: Implement `mcp_server.py` with `list_modules` tool**

```python
# platform/src/mcp_server.py
"""MCP server for mid-session module loading.

Exposes tools to the AI agent so it can discover and load modules
during a conversation without the user going back to the web UI.

Run with: uv run mcp-server
"""

import json
import logging

from mcp.server.fastmcp import FastMCP

from src.modules_core import CONTEXT_DIR, read_state

log = logging.getLogger(__name__)

mcp = FastMCP("context-loader")


def _handle_list_modules(context_dir=None):
    """Internal handler for list_modules (testable without MCP transport)."""
    if context_dir is None:
        context_dir = CONTEXT_DIR
    return read_state(context_dir)


@mcp.tool()
def list_modules() -> str:
    """List all loaded and available context modules.

    Returns a JSON object with:
    - loaded: modules currently in /context/ with metadata (who loaded, when, secrets)
    - available: modules that can be loaded with load_module()

    Use this to discover what context is available before loading.
    """
    result = _handle_list_modules()
    return json.dumps(result, indent=2)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_mcp_server.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/mcp_server.py platform/tests/test_mcp_server.py
git commit -m "feat: add MCP server with list_modules tool"
```

---

## Task 5: Add `load_module` tool to MCP server

**Files:**
- Modify: `platform/src/mcp_server.py`
- Modify: `platform/tests/test_mcp_server.py`

- [ ] **Step 1: Write test for `load_module` tool**

```python
# Add to platform/tests/test_mcp_server.py

def test_load_module_already_loaded(tmp_path):
    """Returns error when module is already loaded."""
    from src.mcp_server import _handle_load_module
    from src.modules_core import write_state

    (tmp_path / "linear").mkdir()
    state = {
        "loaded": {"linear": {"loaded_at": "...", "loaded_by": "user", "has_secrets": False}},
        "available": [],
    }
    write_state(tmp_path, state)

    result = _handle_load_module("linear", tmp_path)
    assert "error" in result
    assert "already loaded" in result["error"]


def test_load_module_not_found(tmp_path):
    """Returns error when module doesn't exist in registry."""
    from src.mcp_server import _handle_load_module

    with patch("src.modules_core.list_available_modules", return_value=["linear"]):
        result = _handle_load_module("nonexistent", tmp_path)
    assert "error" in result
    assert "not found" in result["error"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_mcp_server.py::test_load_module_already_loaded tests/test_mcp_server.py::test_load_module_not_found -v`
Expected: FAIL — `_handle_load_module` doesn't exist

- [ ] **Step 3: Implement `load_module` tool**

Add to `mcp_server.py`:

```python
from src.modules_core import CONTEXT_DIR, read_state, load_single_module


def _handle_load_module(name: str, context_dir=None):
    """Internal handler for load_module (testable)."""
    if context_dir is None:
        context_dir = CONTEXT_DIR
    try:
        info = load_single_module(name, context_dir)
        return {"status": "loaded", **info}
    except ValueError as e:
        return {"error": str(e)}


@mcp.tool()
def load_module(name: str) -> str:
    """Load a context module into /context/ for this session.

    Downloads the module from the registry, injects secrets via Varlock,
    and returns the module summary (info.md content).

    Args:
        name: Module name (e.g. "linear", "stripe", "supabase")

    Use list_modules() first to see what's available.
    """
    result = _handle_load_module(name)
    return json.dumps(result, indent=2)
```

- [ ] **Step 4: Run all MCP tests**

Run: `cd platform && uv run pytest tests/test_mcp_server.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/mcp_server.py platform/tests/test_mcp_server.py
git commit -m "feat: add load_module tool to MCP server"
```

---

## Task 6: Add `get_module_summary` tool to MCP server

**Files:**
- Modify: `platform/src/mcp_server.py`
- Modify: `platform/tests/test_mcp_server.py`

**Why:** Enables lazy loading — the agent can preview what a module contains (via its `info.md`) before deciding to load the full thing. Keeps token budget lean.

- [ ] **Step 1: Write test for `get_module_summary`**

```python
# Add to platform/tests/test_mcp_server.py

def test_get_module_summary_loaded_module(tmp_path):
    """Returns info.md content for a loaded module."""
    from src.mcp_server import _handle_get_module_summary

    mod_dir = tmp_path / "linear"
    mod_dir.mkdir()
    (mod_dir / "info.md").write_text("# Linear\nIntegration for issue tracking.")

    result = _handle_get_module_summary("linear", tmp_path)
    assert "Linear" in result["summary"]
    assert result["source"] == "local"


def test_get_module_summary_not_loaded_fetches_from_registry(tmp_path):
    """Fetches info.md from GitHub for unloaded modules."""
    from src.mcp_server import _handle_get_module_summary
    import base64

    mock_response = {"content": base64.b64encode(b"# Jira\nProject management.").decode()}
    with patch("src.modules_core._gh_api", return_value=mock_response):
        result = _handle_get_module_summary("jira", tmp_path)
    assert "Jira" in result["summary"]
    assert result["source"] == "registry"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_mcp_server.py::test_get_module_summary_loaded_module tests/test_mcp_server.py::test_get_module_summary_not_loaded_fetches_from_registry -v`
Expected: FAIL

- [ ] **Step 3: Implement `get_module_summary` tool**

Add to `mcp_server.py`:

```python
import base64
from src.modules_core import _gh_api, GH_OWNER


def _handle_get_module_summary(name: str, context_dir=None):
    """Internal handler for get_module_summary."""
    if context_dir is None:
        context_dir = CONTEXT_DIR

    # Check local first (already loaded)
    local_info = context_dir / name / "info.md"
    if local_info.exists():
        return {"name": name, "summary": local_info.read_text(), "source": "local"}

    # Fetch from registry without downloading entire module
    if GH_OWNER:
        try:
            file_data = _gh_api(f"{name}/info.md")
            content = base64.b64decode(file_data["content"]).decode()
            return {"name": name, "summary": content, "source": "registry"}
        except Exception as e:
            return {"error": f"Could not fetch summary for '{name}': {e}"}

    return {"error": f"Module '{name}' not found locally and no GitHub registry configured"}


@mcp.tool()
def get_module_summary(name: str) -> str:
    """Get a module's summary (info.md) without loading the full module.

    Use this for lazy discovery — check what a module contains before
    deciding to load it with load_module(). Saves tokens by not pulling
    all docs upfront.

    Args:
        name: Module name (e.g. "jira", "stripe")

    Returns the info.md content and whether it came from local disk or the registry.
    """
    result = _handle_get_module_summary(name)
    return json.dumps(result, indent=2)
```

- [ ] **Step 4: Run all MCP tests**

Run: `cd platform && uv run pytest tests/test_mcp_server.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/mcp_server.py platform/tests/test_mcp_server.py
git commit -m "feat: add get_module_summary tool for lazy loading"
```

---

## Task 7: Wire MCP server into Docker and Claude Code config

**Files:**
- Modify: `platform/deploy/Dockerfile`

**Why:** The MCP server needs to run inside the container and Claude Code needs to be configured to connect to it via stdio. No `docker-compose.yml` changes needed — the MCP server is started on-demand by Claude Code via the `.mcp.json` config, not as a long-running service.

- [ ] **Step 1: Add MCP config via `.mcp.json` in the app directory**

Using `.mcp.json` (project-level MCP config) avoids overwriting any existing Claude Code settings in `~/.claude/settings.json`. Add to the Dockerfile after the `RUN mkdir -p src/context` line:

```dockerfile
# Configure Claude Code to use the context-loader MCP server
RUN echo '{\
  "mcpServers": {\
    "context-loader": {\
      "command": "uv",\
      "args": ["run", "mcp-server"],\
      "cwd": "/app"\
    }\
  }\
}' > /app/.mcp.json
```

- [ ] **Step 2: Verify the MCP config is valid JSON**

Run: `echo '{"mcpServers":{"context-loader":{"command":"uv","args":["run","mcp-server"],"cwd":"/app"}}}' | python3 -m json.tool`
Expected: Valid JSON output

- [ ] **Step 3: Commit**

```bash
git add platform/deploy/Dockerfile
git commit -m "feat: configure Claude Code MCP server in Docker container"
```

---

## Task 8: Integration test — full MCP flow

**Files:**
- Create: `platform/tests/test_integration.py`

**Why:** Verify the full flow works end-to-end: state file written by server → MCP reads it → MCP loads a module → state updated.

- [ ] **Step 1: Write integration test**

```python
# platform/tests/test_integration.py
"""Integration test: simulates the full flow from web UI load to MCP mid-session load."""

import json
from pathlib import Path
from unittest.mock import patch

from src.modules_core import write_state, read_state, build_full_state


def test_full_flow_state_file_coordination(tmp_path):
    """
    Simulates:
    1. User loads modules via web UI → state file written
    2. MCP server reads state → sees loaded + available
    3. Agent loads a new module via MCP → state updated
    """
    from src.mcp_server import _handle_list_modules, _handle_load_module

    # Step 1: Simulate web UI loading "linear" (what server.py /load does)
    linear_dir = tmp_path / "linear"
    linear_dir.mkdir()
    (linear_dir / "info.md").write_text("# Linear\nIssue tracking integration.")

    state = {
        "loaded": {
            "linear": {"loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user", "has_secrets": True}
        },
        "available": [
            {"name": "jira", "type": "integration", "description": "Jira PM"},
            {"name": "stripe", "type": "integration", "description": "Payments"},
        ],
    }
    write_state(tmp_path, state)

    # Step 2: MCP reads the state
    result = _handle_list_modules(tmp_path)
    assert "linear" in result["loaded"]
    assert len(result["available"]) == 2

    # Step 3: Agent loads "jira" mid-session via MCP
    # Mock the download since we don't have a real GitHub repo.
    # We mock at the modules_core level so add_module_to_state still runs.
    def fake_download(name, dest, **kwargs):
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "info.md").write_text(f"# {name}\nLoaded by agent.")

    with (
        patch("src.modules_core.download_module", side_effect=fake_download),
        patch("src.modules_core.list_available_modules", return_value=["linear", "jira", "stripe"]),
    ):
        load_result = _handle_load_module("jira", tmp_path)

    assert load_result["status"] == "loaded"

    # Step 4: Verify state was updated
    final_state = read_state(tmp_path)
    assert "jira" in final_state["loaded"]
    assert final_state["loaded"]["jira"]["loaded_by"] == "agent"
    assert "linear" in final_state["loaded"]  # still there
    assert all(m["name"] != "jira" for m in final_state["available"])  # removed from available
```

- [ ] **Step 2: Run integration test**

Run: `cd platform && uv run pytest tests/test_integration.py -v`
Expected: PASS

- [ ] **Step 3: Run all tests together**

Run: `cd platform && uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add platform/tests/test_integration.py
git commit -m "test: add integration test for state file coordination"
```

---

## Summary

| Task | What it does | Key files |
|------|-------------|-----------|
| 0 | Set up test infrastructure (pytest, `tests/`) | `pyproject.toml`, `tests/__init__.py` |
| 1 | Extract shared logic into `modules_core.py` | `modules_core.py`, tests |
| 2 | Migrate `server.py` to import from `modules_core` | `server.py` |
| 3 | Add `mcp` dependency + entry point | `pyproject.toml` |
| 4 | MCP server + `list_modules` tool | `mcp_server.py`, tests |
| 5 | `load_module` tool (mid-session loading) | `mcp_server.py`, tests |
| 6 | `get_module_summary` tool (lazy loading) | `mcp_server.py`, tests |
| 7 | Docker + Claude Code MCP config | `Dockerfile` |
| 8 | Integration test — full flow | `test_integration.py` |

After all tasks: the agent can call `list_modules()` to see what's available, `get_module_summary("stripe")` to preview, and `load_module("stripe")` to pull it in mid-conversation — all without the user leaving the chat.
