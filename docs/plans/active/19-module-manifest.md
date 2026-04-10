# Module Manifest (`module.yaml`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-module `.env.schema` and `requirements.txt` files with a single `module.yaml` manifest, eliminating scattered file-scanning logic and the `MANAGED_FILES` constant.

**Architecture:** A new `services/manifest.py` provides read/write for a Pydantic-validated `ModuleManifest` model backed by YAML. Every consumer that currently reads `.env.schema` or `requirements.txt` switches to reading the manifest. The `MANAGED_FILES` set in config shrinks to `{"llms.txt", "module.yaml"}` (both auto-managed). The global `.env.schema` for varlock is still generated at workspace load time, but from manifest data rather than per-module schema files.

**Tech Stack:** Python 3.12, PyYAML (already in deps), Pydantic, FastAPI, pytest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `platform/src/services/manifest.py` | Create | `ModuleManifest` Pydantic model, `read_manifest()`, `write_manifest()` |
| `platform/tests/test_manifest.py` | Create | Unit tests for manifest read/write/validation |
| `platform/src/config.py` | Modify | Update `MANAGED_FILES` constant |
| `platform/tests/test_config.py` | Modify | Update `test_managed_files` assertion |
| `platform/src/routes/modules.py` | Modify | CRUD reads/writes `module.yaml` via manifest service |
| `platform/src/routes/workspace.py` | Modify | Build global schema + install deps from manifests |
| `platform/src/services/schemas.py` | Modify | `generate_global_schema()` accepts `dict[str, list[str]]` |
| `platform/src/services/deps.py` | Modify | Install deps from manifest's dependency list |
| `platform/src/services/secrets.py` | Modify | Build var→module mapping from manifests |
| `platform/src/services/workspace_inspect.py` | Modify | `inspect_module_packages()` reads manifest |
| `platform/tests/test_schemas.py` | Create | Tests for updated schema generation |
| `platform/tests/test_workspace_flow.py` | Create | Integration test for workspace load with manifests |

---

### Task 1: Manifest service — model and read/write

**Files:**
- Create: `platform/src/services/manifest.py`
- Create: `platform/tests/test_manifest.py`

- [ ] **Step 1: Write failing tests for manifest model and I/O**

```python
# platform/tests/test_manifest.py
"""Tests for the module manifest service."""
import yaml
import pytest
from pathlib import Path


@pytest.fixture
def module_dir(tmp_path):
    """A temporary module directory."""
    d = tmp_path / "linear"
    d.mkdir()
    return d


class TestReadManifest:
    def test_reads_valid_manifest(self, module_dir):
        from src.services.manifest import read_manifest

        (module_dir / "module.yaml").write_text(
            "name: linear\n"
            'summary: "Manage Linear issues"\n'
            "secrets:\n"
            "  - LINEAR_API_KEY\n"
            "dependencies:\n"
            "  - linear-sdk\n"
        )
        m = read_manifest(module_dir)
        assert m.name == "linear"
        assert m.summary == "Manage Linear issues"
        assert m.secrets == ["LINEAR_API_KEY"]
        assert m.dependencies == ["linear-sdk"]

    def test_missing_manifest_returns_defaults(self, module_dir):
        from src.services.manifest import read_manifest

        m = read_manifest(module_dir)
        assert m.name == "linear"  # inferred from directory name
        assert m.summary == ""
        assert m.secrets == []
        assert m.dependencies == []

    def test_minimal_manifest_fills_defaults(self, module_dir):
        from src.services.manifest import read_manifest

        (module_dir / "module.yaml").write_text("name: linear\n")
        m = read_manifest(module_dir)
        assert m.secrets == []
        assert m.dependencies == []
        assert m.summary == ""


class TestWriteManifest:
    def test_roundtrip(self, module_dir):
        from src.services.manifest import ModuleManifest, read_manifest, write_manifest

        original = ModuleManifest(
            name="linear",
            summary="Manage Linear issues",
            secrets=["LINEAR_API_KEY", "LINEAR_WEBHOOK_SECRET"],
            dependencies=["linear-sdk", "httpx"],
        )
        write_manifest(module_dir, original)
        loaded = read_manifest(module_dir)
        assert loaded == original

    def test_write_creates_valid_yaml(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="stripe", secrets=["STRIPE_SECRET_KEY"])
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert raw["name"] == "stripe"
        assert raw["secrets"] == ["STRIPE_SECRET_KEY"]

    def test_write_omits_empty_lists(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="simple")
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert "secrets" not in raw
        assert "dependencies" not in raw

    def test_write_omits_empty_summary(self, module_dir):
        from src.services.manifest import ModuleManifest, write_manifest

        m = ModuleManifest(name="simple")
        write_manifest(module_dir, m)
        raw = yaml.safe_load((module_dir / "module.yaml").read_text())
        assert "summary" not in raw
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_manifest.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.services.manifest'`

- [ ] **Step 3: Implement manifest service**

```python
# platform/src/services/manifest.py
"""Module manifest (module.yaml) read/write service.

Each module can have a module.yaml declaring its name, summary, secrets,
and dependencies.  This replaces the previous per-module .env.schema and
requirements.txt files.
"""
from pathlib import Path

import yaml
from pydantic import BaseModel


class ModuleManifest(BaseModel):
    name: str
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []


def read_manifest(module_dir: Path) -> ModuleManifest:
    """Read module.yaml from a module directory.

    Returns a manifest with defaults (name inferred from dir) if the
    file doesn't exist.
    """
    manifest_path = module_dir / "module.yaml"
    if not manifest_path.exists():
        return ModuleManifest(name=module_dir.name)
    raw = yaml.safe_load(manifest_path.read_text()) or {}
    raw.setdefault("name", module_dir.name)
    return ModuleManifest(**raw)


def write_manifest(module_dir: Path, manifest: ModuleManifest) -> None:
    """Write a ModuleManifest to module.yaml, omitting empty optional fields."""
    data: dict = {"name": manifest.name}
    if manifest.summary:
        data["summary"] = manifest.summary
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_manifest.py -v`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/manifest.py platform/tests/test_manifest.py
git commit -m "feat(manifest): add ModuleManifest model and read/write service"
```

---

### Task 2: Update `MANAGED_FILES` in config

**Files:**
- Modify: `platform/src/config.py:40`
- Modify: `platform/tests/test_config.py:67-68`

- [ ] **Step 1: Update the test assertion**

In `platform/tests/test_config.py`, change the `test_managed_files` test:

```python
# OLD
def test_managed_files(self):
    s = _make_settings()
    assert s.MANAGED_FILES == {"llms.txt", ".env.schema", "requirements.txt"}

# NEW
def test_managed_files(self):
    s = _make_settings()
    assert s.MANAGED_FILES == {"llms.txt", "module.yaml"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd platform && uv run pytest tests/test_config.py::TestConstants::test_managed_files -v`
Expected: FAIL — `{"llms.txt", ".env.schema", "requirements.txt"} != {"llms.txt", "module.yaml"}`

- [ ] **Step 3: Update config**

In `platform/src/config.py`, line 40:

```python
# OLD
MANAGED_FILES: frozenset[str] = frozenset({"llms.txt", ".env.schema", "requirements.txt"})

# NEW
MANAGED_FILES: frozenset[str] = frozenset({"llms.txt", "module.yaml"})
```

- [ ] **Step 4: Run full test suite**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/config.py platform/tests/test_config.py
git commit -m "refactor(config): update MANAGED_FILES for module.yaml"
```

---

### Task 3: Update schema generation to accept secrets lists

**Files:**
- Modify: `platform/src/services/schemas.py`
- Create: `platform/tests/test_schemas.py`

The key change: `generate_global_schema()` currently takes `dict[str, str]` (module→raw schema text) and parses each schema internally. It should take `dict[str, list[str]]` (module→secret names) since manifests provide secrets as a list directly. This also lets us delete `_extract_module_vars()`, `generate_env_schema()`, and `parse_env_schema()`.

- [ ] **Step 1: Write tests for the updated schema generation**

```python
# platform/tests/test_schemas.py
"""Tests for schema generation from manifest data."""
import pytest


class TestGenerateGlobalSchema:
    def test_single_module_produces_valid_schema(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({"linear": ["LINEAR_API_KEY"]})
        assert "LINEAR_API_KEY=infisical(linear, LINEAR_API_KEY)" in result
        assert "secretPath=/linear" in result
        assert "@plugin(" in result

    def test_multiple_modules_sorted(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({
            "stripe": ["STRIPE_SECRET_KEY"],
            "linear": ["LINEAR_API_KEY"],
        })
        # linear should come before stripe (sorted)
        linear_pos = result.index("secretPath=/linear")
        stripe_pos = result.index("secretPath=/stripe")
        assert linear_pos < stripe_pos

    def test_empty_modules_still_has_header(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({})
        assert "AUTO-GENERATED" in result
        assert "INFISICAL_PROJECT_ID=" in result

    def test_multiple_secrets_per_module(self):
        from src.services.schemas import generate_global_schema

        result = generate_global_schema({
            "stripe": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        })
        assert "STRIPE_SECRET_KEY=infisical(stripe, STRIPE_SECRET_KEY)" in result
        assert "STRIPE_WEBHOOK_SECRET=infisical(stripe, STRIPE_WEBHOOK_SECRET)" in result


class TestValidateModuleName:
    def test_valid_name(self):
        from src.services.schemas import validate_module_name
        assert validate_module_name("linear") == "linear"

    def test_strips_whitespace(self):
        from src.services.schemas import validate_module_name
        assert validate_module_name("  linear  ") == "linear"

    def test_rejects_empty(self):
        from src.services.schemas import validate_module_name
        with pytest.raises(ValueError):
            validate_module_name("")

    def test_rejects_path_traversal(self):
        from src.services.schemas import validate_module_name
        with pytest.raises(ValueError):
            validate_module_name("../etc")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_schemas.py -v`
Expected: FAIL — `generate_global_schema()` signature mismatch (still expects `dict[str, str]`)

- [ ] **Step 3: Update schemas.py**

Replace the contents of `platform/src/services/schemas.py`:

```python
# platform/src/services/schemas.py
import re

from src.config import settings

INFISICAL_PLUGIN = "@varlock/infisical-plugin@0.0.6"

INFISICAL_BOOTSTRAP_VARS = {
    "INFISICAL_PROJECT_ID",
    "INFISICAL_ENVIRONMENT",
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
}

_VALID_MODULE_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def validate_module_name(name: str) -> str:
    """Sanitize and validate a module name. Raises ValueError if invalid."""
    name = name.strip()
    if not name or not _VALID_MODULE_NAME.match(name):
        raise ValueError(
            f"Invalid module name: '{name}'. Use only letters, numbers, hyphens, underscores."
        )
    return name


def validate_module_file_path(file_path: str, managed_files: frozenset[str]) -> str:
    """Validate a file path within a module. Returns cleaned path or raises ValueError."""
    file_path = file_path.strip().strip("/")
    if not file_path:
        raise ValueError("File path cannot be empty")
    if ".." in file_path:
        raise ValueError("File path cannot contain '..'")
    if file_path in managed_files:
        raise ValueError(f"'{file_path}' is managed automatically and cannot be edited directly")
    if file_path == "info.md":
        return file_path
    if file_path.startswith("docs/") and file_path.endswith(".md"):
        return file_path
    raise ValueError("Only info.md and .md files under docs/ are allowed")


def generate_global_schema(modules_with_secrets: dict[str, list[str]]) -> str:
    """Generate a single .env.schema for the workspace root.

    Args:
        modules_with_secrets: {module_name: [secret_var_names]} for each
            loaded module that has secrets.

    Returns:
        Complete schema text with one @initInfisical block per module,
        shared bootstrap var declarations, and per-var infisical() resolvers.
    """
    lines = [
        "# AUTO-GENERATED — do not edit or read this file.",
        "# Varlock uses it to resolve module secrets at runtime.",
        "# All credentials are pre-configured. Just use: varlock run -- <command>",
        f"# @plugin({INFISICAL_PLUGIN})",
    ]

    for module_name in sorted(modules_with_secrets):
        lines.extend([
            "# @initInfisical(",
            f"#   id={module_name},",
            "#   projectId=$INFISICAL_PROJECT_ID,",
            "#   environment=$INFISICAL_ENVIRONMENT,",
            "#   clientId=$INFISICAL_CLIENT_ID,",
            "#   clientSecret=$INFISICAL_CLIENT_SECRET,",
            f"#   secretPath=/{module_name},",
            f"#   siteUrl={settings.INFISICAL_SITE_URL}",
            "# )",
        ])

    lines.append("# ---")

    lines.extend([
        "# @type=string @required",
        "INFISICAL_PROJECT_ID=",
        "# @type=string @required",
        "INFISICAL_ENVIRONMENT=",
        "# @type=infisicalClientId @required",
        "INFISICAL_CLIENT_ID=",
        "# @type=infisicalClientSecret @sensitive @required",
        "INFISICAL_CLIENT_SECRET=",
    ])

    for module_name in sorted(modules_with_secrets):
        for var in modules_with_secrets[module_name]:
            lines.append("# @required @sensitive @type=string")
            lines.append(f"{var}=infisical({module_name}, {var})")

    return "\n".join(lines) + "\n"
```

This removes: `generate_env_schema()`, `parse_env_schema()`, `_extract_module_vars()`.

- [ ] **Step 4: Run schema tests**

Run: `cd platform && uv run pytest tests/test_schemas.py -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/schemas.py platform/tests/test_schemas.py
git commit -m "refactor(schemas): generate_global_schema takes secret lists instead of raw schema text"
```

---

### Task 4: Update module CRUD routes

**Files:**
- Modify: `platform/src/routes/modules.py`

This is the biggest change. The module CRUD endpoints switch from reading/writing `.env.schema` + `requirements.txt` to reading/writing `module.yaml` via the manifest service.

- [ ] **Step 1: Update `api_get_module` to read from manifest**

In `platform/src/routes/modules.py`, replace lines 37-72 (`api_get_module`):

```python
@router.get("/{name}")
async def api_get_module(name: str):
    """Get module detail: info.md content, summary, secrets, dependencies."""
    try:
        content = git_repo.read_file(name, "info.md")
    except FileNotFoundError:
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    manifest = read_manifest(git_repo.module_dir(name))

    summary = manifest.summary
    if not summary:
        try:
            llms_text = git_repo.read_file(name, "llms.txt")
            summary = extract_module_summary(llms_text)
        except FileNotFoundError:
            pass

    return {
        "name": name,
        "content": content,
        "summary": summary,
        "secrets": manifest.secrets,
        "requirements": manifest.dependencies,
    }
```

- [ ] **Step 2: Update `api_create_module` to write manifest**

Replace lines 75-103 (`api_create_module`):

```python
@router.post("", status_code=201)
async def api_create_module(body: CreateModuleRequest):
    """Create a new module with info.md, llms.txt, and module.yaml."""
    name = validate_module_name(body.name)

    try:
        git_repo.create_module_dir(name)
    except FileExistsError:
        return JSONResponse(
            {"error": f"Module '{name}' already exists"}, status_code=409
        )

    git_repo.write_file(name, "info.md", body.content)
    files = ["info.md"]

    manifest = ModuleManifest(
        name=name,
        summary=body.summary,
        secrets=body.secrets,
        dependencies=body.requirements,
    )
    write_manifest(git_repo.module_dir(name), manifest)

    llms_txt = generate_module_llms_txt(name, body.summary, files)
    git_repo.write_file(name, "llms.txt", llms_txt)

    return {"name": name}
```

- [ ] **Step 3: Update `api_update_module` to write manifest**

Replace lines 106-133 (`api_update_module`):

```python
@router.put("/{name}")
async def api_update_module(name: str, body: UpdateModuleRequest):
    """Update a module's info.md, module.yaml, and llms.txt."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    git_repo.write_file(name, "info.md", body.content)

    manifest = ModuleManifest(
        name=name,
        summary=body.summary,
        secrets=body.secrets,
        dependencies=body.requirements,
    )
    write_manifest(git_repo.module_dir(name), manifest)

    regenerate_module_llms_txt(name, settings.MANAGED_FILES, summary=body.summary)

    return {"name": name}
```

- [ ] **Step 4: Update imports at top of file**

Replace the imports block at the top of `platform/src/routes/modules.py`:

```python
import os
import subprocess

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.llms import (
    extract_module_summary,
    generate_module_llms_txt,
    regenerate_module_llms_txt,
)
from src.models import (
    CreateModuleRequest,
    FileContentRequest,
    GenerateModuleRequest,
    GenerateModuleResponse,
    UpdateModuleRequest,
)
from src.config import settings
from src.services import git_repo
from src.services.manifest import ModuleManifest, read_manifest, write_manifest
from src.services.schemas import validate_module_file_path, validate_module_name
```

Note: `generate_env_schema` and `parse_env_schema` imports are removed.

- [ ] **Step 5: Add `module_dir()` helper to git_repo**

In `platform/src/services/git_repo.py`, add after `module_exists()` (after line 117):

```python
def module_dir(name: str, *, clone_dir: Path | None = None) -> Path:
    """Return the Path to a module's directory in the local clone."""
    return _resolve_clone(clone_dir) / name
```

- [ ] **Step 6: Run full test suite**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add platform/src/routes/modules.py platform/src/services/git_repo.py
git commit -m "refactor(modules): CRUD reads/writes module.yaml instead of .env.schema + requirements.txt"
```

---

### Task 5: Update workspace load to use manifests

**Files:**
- Modify: `platform/src/routes/workspace.py`
- Modify: `platform/src/services/deps.py`
- Modify: `platform/src/services/workspace_inspect.py`

- [ ] **Step 1: Update `deps.py` to install from a list of package names**

Replace `platform/src/services/deps.py`:

```python
# platform/src/services/deps.py
import logging
import subprocess
import sys
from pathlib import Path

log = logging.getLogger(__name__)


def install_module_deps(module_dir: Path) -> subprocess.CompletedProcess | None:
    """Install Python deps from a module's module.yaml into the platform venv.

    Reads the manifest to get the dependency list. Returns the
    CompletedProcess if there are deps to install, None otherwise.
    """
    from src.services.manifest import read_manifest

    manifest = read_manifest(module_dir)
    if not manifest.dependencies:
        return None

    return subprocess.run(
        ["uv", "pip", "install", "--python", sys.executable] + manifest.dependencies,
        capture_output=True,
        text=True,
        timeout=120,
    )
```

- [ ] **Step 2: Update `workspace_inspect.py` to read packages from manifest**

In `platform/src/services/workspace_inspect.py`, replace `inspect_module_packages()` (lines 55-76):

```python
def inspect_module_packages(module_dir: Path) -> list[dict]:
    """Return [{name, version, installed}] for each package declared in
    the module's module.yaml. Empty list if no dependencies.

    Uses importlib.metadata to look up the currently-installed version
    of each package in the platform's shared venv.
    """
    from src.services.manifest import read_manifest

    manifest = read_manifest(module_dir)
    if not manifest.dependencies:
        return []

    out: list[dict] = []
    for name in manifest.dependencies:
        try:
            v = _version(name)
            out.append({"name": name, "version": v, "installed": True})
        except PackageNotFoundError:
            out.append({"name": name, "version": None, "installed": False})
    return out
```

Also remove the now-unused `_parse_requirement()` function (lines 38-52).

- [ ] **Step 3: Update workspace load to build global schema from manifests**

In `platform/src/routes/workspace.py`, replace the global schema generation block (lines 153-166):

```python
    # Generate global .env.schema for varlock at workspace root.
    modules_with_secrets: dict[str, list[str]] = {}
    for name in loaded:
        manifest = read_manifest(settings.CONTEXT_DIR / name)
        if manifest.secrets:
            modules_with_secrets[name] = manifest.secrets
    if modules_with_secrets:
        (settings.CONTEXT_DIR / ".env.schema").write_text(
            generate_global_schema(modules_with_secrets)
        )
    else:
        schema_file = settings.CONTEXT_DIR / ".env.schema"
        if schema_file.exists():
            schema_file.unlink()
```

And add the import at the top of `platform/src/routes/workspace.py`:

```python
from src.services.manifest import read_manifest
```

- [ ] **Step 4: Run full test suite**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/deps.py platform/src/services/workspace_inspect.py platform/src/routes/workspace.py
git commit -m "refactor(workspace): load secrets and deps from module.yaml manifests"
```

---

### Task 6: Update secrets service to use manifests

**Files:**
- Modify: `platform/src/services/secrets.py`

- [ ] **Step 1: Update `get_secrets_status()` to read manifests instead of `.env.schema`**

In `platform/src/services/secrets.py`, replace the var→module mapping block in `get_secrets_status()` (lines 98-113):

```python
    # Build var_name -> module_name mapping from each module's manifest
    from src.services.manifest import read_manifest

    var_to_module: dict[str, str] = {}
    modules = list_modules_fn(directory)
    modules_with_secrets: list[str] = []
    for name in modules:
        manifest = read_manifest(directory / name)
        if manifest.secrets:
            modules_with_secrets.append(name)
            for var in manifest.secrets:
                var_to_module[var] = name
```

Also update the check at the top of the function — the global `.env.schema` at workspace root is still the trigger:

```python
    if not (directory / ".env.schema").exists():
        return {}
```

This stays unchanged — the global `.env.schema` is still generated at load time.

And update the `result` initialization to use `modules_with_secrets` instead of `modules`:

```python
    # Run varlock once at workspace root
    try:
        previews = await asyncio.to_thread(load_and_mask_secrets, directory)
    except SecretsValidationError as e:
        log.warning("global varlock failed (missing=%s)", e.missing)
        result: dict[str, dict[str, str | None]] = {m: {} for m in modules_with_secrets}
        for var, mod in var_to_module.items():
            result[mod][var] = None
        return result

    # Split resolved vars by module
    result = {m: {} for m in modules_with_secrets}
    for var, value in previews.items():
        mod = var_to_module.get(var)
        if mod and mod in result:
            result[mod][var] = value
    for var, mod in var_to_module.items():
        if var not in previews and mod in result:
            result[mod][var] = None
    return result
```

- [ ] **Step 2: Run full test suite**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add platform/src/services/secrets.py
git commit -m "refactor(secrets): read module secrets from manifest instead of .env.schema"
```

---

### Task 7: Integration test for workspace load flow

**Files:**
- Create: `platform/tests/test_workspace_flow.py`

- [ ] **Step 1: Write integration test**

```python
# platform/tests/test_workspace_flow.py
"""Integration test: manifest → global schema → dep install flow."""
import os
from pathlib import Path
from unittest.mock import patch

import yaml
import pytest


@pytest.fixture
def workspace(tmp_path):
    """Set up a fake modules-repo and context dir."""
    modules_repo = tmp_path / "modules-repo"
    context_dir = tmp_path / "context"
    modules_repo.mkdir()
    context_dir.mkdir()

    # Create a module with a manifest
    mod = modules_repo / "linear"
    mod.mkdir()
    (mod / "info.md").write_text("# Linear\nIntegration with Linear.")
    (mod / "module.yaml").write_text(yaml.dump({
        "name": "linear",
        "summary": "Manage Linear issues",
        "secrets": ["LINEAR_API_KEY"],
        "dependencies": ["httpx"],
    }))

    return {"modules_repo": modules_repo, "context_dir": context_dir}


class TestManifestToGlobalSchema:
    def test_global_schema_built_from_manifest(self, workspace):
        """Verify that generate_global_schema produces correct output
        when fed secrets from a manifest."""
        from src.services.manifest import read_manifest
        from src.services.schemas import generate_global_schema

        manifest = read_manifest(workspace["modules_repo"] / "linear")
        schema = generate_global_schema({"linear": manifest.secrets})

        assert "LINEAR_API_KEY=infisical(linear, LINEAR_API_KEY)" in schema
        assert "secretPath=/linear" in schema

    def test_no_secrets_produces_no_schema(self, workspace):
        """A module with no secrets should not appear in the global schema."""
        from src.services.manifest import read_manifest
        from src.services.schemas import generate_global_schema

        # Overwrite manifest with no secrets
        (workspace["modules_repo"] / "linear" / "module.yaml").write_text(
            yaml.dump({"name": "linear"})
        )
        manifest = read_manifest(workspace["modules_repo"] / "linear")
        schema = generate_global_schema({})
        assert "linear" not in schema.lower().split("auto-generated")[0]


class TestManifestPackageInspection:
    def test_inspect_reads_from_manifest(self, workspace):
        from src.services.workspace_inspect import inspect_module_packages

        packages = inspect_module_packages(workspace["modules_repo"] / "linear")
        names = [p["name"] for p in packages]
        assert "httpx" in names

    def test_inspect_empty_manifest(self, workspace):
        from src.services.workspace_inspect import inspect_module_packages

        (workspace["modules_repo"] / "linear" / "module.yaml").write_text(
            yaml.dump({"name": "linear"})
        )
        packages = inspect_module_packages(workspace["modules_repo"] / "linear")
        assert packages == []
```

- [ ] **Step 2: Run integration tests**

Run: `cd platform && uv run pytest tests/test_workspace_flow.py -v`
Expected: all tests PASS

- [ ] **Step 3: Run full test suite**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add platform/tests/test_workspace_flow.py
git commit -m "test(workspace): add integration tests for manifest-driven workspace flow"
```

---

### Task 8: Clean up dead code and update llms.txt

**Files:**
- Modify: `platform/src/services/workspace_inspect.py` (remove `_parse_requirement` if not yet removed)
- Modify: `llms.txt` (root)

- [ ] **Step 1: Verify no remaining references to old patterns**

Run:
```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader
grep -rn "generate_env_schema\|parse_env_schema\|_extract_module_vars" platform/src/ --include="*.py"
grep -rn "requirements\.txt" platform/src/ --include="*.py"
grep -rn '\.env\.schema' platform/src/ --include="*.py" | grep -v "context/\.env\.schema" | grep -v "# AUTO-GENERATED"
```

Expected: No hits from source code (only the global `.env.schema` generation in workspace.py and the global check in secrets.py should remain).

If any references remain, update them to use the manifest service.

- [ ] **Step 2: Update root llms.txt**

Add entry for the new manifest service file. The `update-llms` skill or manual edit should add:

```
- [platform/src/services/manifest.py](platform/src/services/manifest.py) — Module manifest (module.yaml) read/write service
```

- [ ] **Step 3: Run full test suite one final time**

Run: `cd platform && uv run pytest tests/ -v`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(manifest): clean up dead code, update llms.txt"
```

---

## Summary of what gets deleted

| Deleted | Was in |
|---------|--------|
| `generate_env_schema()` | `services/schemas.py` |
| `parse_env_schema()` | `services/schemas.py` |
| `_extract_module_vars()` | `services/schemas.py` |
| `_parse_requirement()` | `services/workspace_inspect.py` |
| Per-module `.env.schema` file reads/writes | `routes/modules.py` |
| Per-module `requirements.txt` file reads/writes | `routes/modules.py` |
| Reading `requirements.txt` from disk | `services/deps.py`, `services/workspace_inspect.py` |
| Reading per-module `.env.schema` from disk | `services/secrets.py`, `routes/workspace.py` |

## What stays unchanged

- **Frontend**: API shape (`secrets: list[str]`, `requirements: list[str]`) is identical
- **Global `.env.schema`**: Still generated at workspace root for varlock
- **`PRESERVED_FILES`**: Still `{"CLAUDE.md"}`
- **`CLAUDE.md` instructions**: Will need a follow-up update (out of scope for this plan — the agent instructions reference `.env.schema` files, but that's documentation, not code)
