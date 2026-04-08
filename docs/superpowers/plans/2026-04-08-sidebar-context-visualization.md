# Sidebar Context Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat MODULES + SECRETS sections in `ContextPanel.tsx` with expandable per-module cards that show files, secrets (with masked previews), and packages (with install status) inline.

**Architecture:** Backend extends `GET /api/workspace` to return per-module rich data (`{name, files, secrets, packages}`). A new `services/workspace_inspect.py` provides the file-listing and package-inspection helpers. The frontend `ContextPanel.tsx` is split into three focused files: the panel shell, a `ModuleList`, and a `ModuleCard`.

**Tech Stack:** Python 3.12 + FastAPI + pytest (backend), React + TypeScript + Tailwind + TanStack Query (frontend).

**Spec:** [`docs/superpowers/specs/2026-04-08-sidebar-context-visualization-design.md`](../specs/2026-04-08-sidebar-context-visualization-design.md)

---

## File map

**Backend — create:**
- `platform/src/services/workspace_inspect.py` — `list_workspace_files()` + `inspect_module_packages()`
- `platform/tests/__init__.py` — bootstraps the project's test package (currently empty)
- `platform/tests/test_workspace_inspect.py` — unit tests for both helpers

**Backend — modify:**
- `platform/src/routes/workspace.py` — `GET /api/workspace` returns the new per-module shape
- `platform/src/models.py` — add `LoadedModule` and `WorkspaceResponse` Pydantic models (only if other endpoints already use models from there; otherwise inline)

**Frontend — create:**
- `platform/frontend/src/components/sidebar/ModuleList.tsx` — renders the loaded cards + idle rows + Load button
- `platform/frontend/src/components/sidebar/ModuleCard.tsx` — single expandable per-module card

**Frontend — modify:**
- `platform/frontend/src/api/workspace.ts` — update `WorkspaceState` shape, drop top-level `secrets`
- `platform/frontend/src/components/ContextPanel.tsx` — shrink to layout shell, delete inline modules + secrets sections, mount `ModuleList`

---

## Task 1: Bootstrap test infrastructure

There are no project tests yet (`platform/tests/` only contains `__pycache__`). Make sure pytest can discover tests under `platform/tests/`.

**Files:**
- Create: `platform/tests/__init__.py` (empty)
- Create: `platform/tests/test_smoke.py` (deleted at end of task)

- [ ] **Step 1: Create the empty test package init**

```bash
touch platform/tests/__init__.py
```

- [ ] **Step 2: Write a smoke test**

Create `platform/tests/test_smoke.py`:

```python
def test_smoke():
    assert 1 + 1 == 2
```

- [ ] **Step 3: Run it**

```bash
cd platform && uv run pytest tests/test_smoke.py -v
```

Expected: 1 passed.

- [ ] **Step 4: Delete the smoke test, commit**

```bash
rm platform/tests/test_smoke.py
git add platform/tests/__init__.py
git commit -m "test: bootstrap pytest test package"
```

---

## Task 2: `list_workspace_files` helper + tests

**Files:**
- Create: `platform/src/services/workspace_inspect.py`
- Create: `platform/tests/test_workspace_inspect.py`

The helper mirrors `git_repo.list_module_files` but operates on the *workspace copy* (`platform/src/context/<module>/`). Returns relative path strings only — no `{name, path}` dicts; the frontend doesn't need both fields.

- [ ] **Step 1: Write the failing test for `list_workspace_files`**

Create `platform/tests/test_workspace_inspect.py`:

```python
from pathlib import Path

from src.services.workspace_inspect import list_workspace_files

MANAGED = {"llms.txt", ".env.schema", "requirements.txt"}


def test_lists_top_level_and_docs(tmp_path: Path):
    mod = tmp_path / "linear"
    mod.mkdir()
    (mod / "info.md").write_text("hi")
    (mod / "llms.txt").write_text("ignored")  # managed
    (mod / ".env.schema").write_text("ignored")  # managed
    docs = mod / "docs"
    docs.mkdir()
    (docs / "api.md").write_text("api")
    (docs / "webhooks.md").write_text("hooks")
    (docs / "ignored.txt").write_text("not md")  # not .md, skipped

    paths = list_workspace_files(mod, MANAGED)

    assert paths == ["info.md", "docs/api.md", "docs/webhooks.md"]


def test_missing_module_raises(tmp_path: Path):
    import pytest
    with pytest.raises(FileNotFoundError):
        list_workspace_files(tmp_path / "nope", MANAGED)
```

- [ ] **Step 2: Run it to verify failure**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` for `workspace_inspect`.

- [ ] **Step 3: Implement the helper**

Create `platform/src/services/workspace_inspect.py`:

```python
"""Inspect a loaded module inside the workspace (context/) directory.

These helpers operate on the workspace *copy* of a module — not the
local clone in modules-repo/. They are read by GET /api/workspace to
build the per-module response.
"""
from pathlib import Path


def list_workspace_files(
    module_dir: Path,
    managed_files: set[str],
) -> list[str]:
    """Return relative paths of user-visible files inside a workspace module.

    Includes top-level files (excluding managed ones) and any `.md` files
    one level deep under `docs/`. Order: top-level alphabetical, then
    docs alphabetical.
    """
    if not module_dir.is_dir():
        raise FileNotFoundError(f"Module dir not found: {module_dir}")

    paths: list[str] = []
    for entry in sorted(module_dir.iterdir()):
        if entry.is_file() and entry.name not in managed_files:
            paths.append(entry.name)

    docs = module_dir / "docs"
    if docs.is_dir():
        for doc in sorted(docs.iterdir()):
            if doc.is_file() and doc.name.endswith(".md"):
                paths.append(f"docs/{doc.name}")

    return paths
```

- [ ] **Step 4: Run the tests, verify pass**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/workspace_inspect.py platform/tests/test_workspace_inspect.py
git commit -m "feat(workspace): add list_workspace_files helper"
```

---

## Task 3: `inspect_module_packages` helper + tests

Reads `requirements.txt` from the workspace module dir, looks up each declared package's installed version via `importlib.metadata`. Returns `[{name, version, installed}]`.

**Files:**
- Modify: `platform/src/services/workspace_inspect.py`
- Modify: `platform/tests/test_workspace_inspect.py`

- [ ] **Step 1: Add failing tests for `inspect_module_packages`**

Append to `platform/tests/test_workspace_inspect.py`:

```python
from src.services.workspace_inspect import inspect_module_packages


def test_inspect_packages_no_requirements(tmp_path: Path):
    mod = tmp_path / "noreq"
    mod.mkdir()
    assert inspect_module_packages(mod) == []


def test_inspect_packages_marks_installed_and_missing(tmp_path: Path):
    mod = tmp_path / "linear"
    mod.mkdir()
    # `pytest` is guaranteed installed in our venv (it's running this test).
    # `definitely-not-a-real-package-xyz` is guaranteed missing.
    (mod / "requirements.txt").write_text(
        "pytest\ndefinitely-not-a-real-package-xyz\n"
    )

    pkgs = inspect_module_packages(mod)

    assert len(pkgs) == 2
    pytest_pkg = next(p for p in pkgs if p["name"] == "pytest")
    assert pytest_pkg["installed"] is True
    assert pytest_pkg["version"] is not None

    missing = next(p for p in pkgs if p["name"] == "definitely-not-a-real-package-xyz")
    assert missing["installed"] is False
    assert missing["version"] is None


def test_inspect_packages_skips_blank_and_comment_lines(tmp_path: Path):
    mod = tmp_path / "x"
    mod.mkdir()
    (mod / "requirements.txt").write_text(
        "# a comment\n\npytest\n  \n"
    )
    pkgs = inspect_module_packages(mod)
    assert [p["name"] for p in pkgs] == ["pytest"]
```

- [ ] **Step 2: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v
```

Expected: `ImportError` for `inspect_module_packages`.

- [ ] **Step 3: Implement `inspect_module_packages`**

Append to `platform/src/services/workspace_inspect.py`:

```python
from importlib.metadata import PackageNotFoundError, version as _version


def _parse_requirement(line: str) -> str | None:
    """Extract just the package name from a requirements.txt line.

    Strips inline comments, version specifiers, and extras. Returns None
    for blank/comment-only lines.
    """
    line = line.split("#", 1)[0].strip()
    if not line:
        return None
    # Cut off version specifiers and extras: `pkg[extra]>=1.0` -> `pkg`
    for sep in ("[", "=", ">", "<", "~", "!", ";", " "):
        idx = line.find(sep)
        if idx != -1:
            line = line[:idx]
    return line.strip() or None


def inspect_module_packages(module_dir: Path) -> list[dict]:
    """Return [{name, version, installed}] for each package declared in
    the module's requirements.txt. Empty list if no requirements.txt.

    Uses importlib.metadata to look up the currently-installed version
    of each package in the platform's shared venv.
    """
    req = module_dir / "requirements.txt"
    if not req.exists():
        return []

    out: list[dict] = []
    for raw in req.read_text().splitlines():
        name = _parse_requirement(raw)
        if name is None:
            continue
        try:
            v = _version(name)
            out.append({"name": name, "version": v, "installed": True})
        except PackageNotFoundError:
            out.append({"name": name, "version": None, "installed": False})
    return out
```

- [ ] **Step 4: Run, verify pass**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v
```

Expected: 5 passed (2 from task 2, 3 new).

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/workspace_inspect.py platform/tests/test_workspace_inspect.py
git commit -m "feat(workspace): add inspect_module_packages helper"
```

---

## Task 4: Extend `GET /api/workspace` response shape

Change the workspace endpoint to return the rich per-module objects. Drop the top-level `secrets` field. Keep the existing `_secrets_cache` mechanism — just inline its values into each module entry.

**Files:**
- Modify: `platform/src/routes/workspace.py`
- Create: `platform/tests/test_workspace_route.py`

- [ ] **Step 1: Write the failing integration test**

Create `platform/tests/test_workspace_route.py`:

```python
"""Integration test for GET /api/workspace's new per-module shape.

Builds a fake workspace by writing files into a temp directory and
patching CONTEXT_DIR + the secrets cache.
"""
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.server import app
from src.routes import workspace as workspace_route


def _make_module(workspace: Path, name: str, *, with_secrets=False, with_req=False):
    mod = workspace / name
    mod.mkdir()
    (mod / "info.md").write_text(f"# {name}")
    if with_secrets:
        (mod / ".env.schema").write_text("FOO_KEY=\n")
    if with_req:
        (mod / "requirements.txt").write_text("pytest\n")


def test_workspace_returns_per_module_shape(tmp_path: Path):
    _make_module(tmp_path, "linear", with_secrets=True, with_req=True)
    _make_module(tmp_path, "stripe", with_secrets=True)

    fake_secrets = {
        "linear": {"FOO_KEY": "fo▒▒▒▒▒"},
        "stripe": {"FOO_KEY": None},  # missing
    }

    with patch.object(workspace_route, "CONTEXT_DIR", tmp_path), \
         patch.object(workspace_route, "_secrets_cache", fake_secrets):
        client = TestClient(app)
        r = client.get("/api/workspace")

    assert r.status_code == 200
    body = r.json()
    assert "secrets" not in body  # top-level secrets dropped
    mods = {m["name"]: m for m in body["modules"]}

    assert set(mods) == {"linear", "stripe"}

    linear = mods["linear"]
    assert linear["files"] == ["info.md"]
    assert linear["secrets"] == {"FOO_KEY": "fo▒▒▒▒▒"}
    assert any(p["name"] == "pytest" and p["installed"] for p in linear["packages"])

    stripe = mods["stripe"]
    assert stripe["files"] == ["info.md"]
    assert stripe["secrets"] == {"FOO_KEY": None}
    assert stripe["packages"] == []  # no requirements.txt
```

- [ ] **Step 2: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_workspace_route.py -v
```

Expected: Either an assertion error on the new shape, or a KeyError because the response still has the old shape.

- [ ] **Step 3: Update `routes/workspace.py`**

Modify `platform/src/routes/workspace.py`. Replace the existing `api_workspace` handler with one that builds the new shape, and update the imports at the top:

```python
# Add to imports
from src.server import CONTEXT_DIR, MANAGED_FILES, list_modules, PRESERVED_FILES
from src.services.workspace_inspect import (
    inspect_module_packages,
    list_workspace_files,
)
```

(`MANAGED_FILES` is already exported from `server.py`, just make sure it's imported here.)

Replace the body of `api_workspace`:

```python
@router.get("")
async def api_workspace():
    """Return loaded modules with per-module files, secrets, and packages."""
    modules = []
    for name in list_modules(CONTEXT_DIR):
        module_dir = CONTEXT_DIR / name
        try:
            files = list_workspace_files(module_dir, MANAGED_FILES)
        except FileNotFoundError:
            files = []
        modules.append({
            "name": name,
            "files": files,
            "secrets": _secrets_cache.get(name, {}),
            "packages": inspect_module_packages(module_dir),
        })
    return {"modules": modules}
```

Note: `_secrets_cache` is already a module-level dict in this file. Reuse it directly.

- [ ] **Step 4: Run the route test**

```bash
cd platform && uv run pytest tests/test_workspace_route.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Run the full test suite to make sure nothing else broke**

```bash
cd platform && uv run pytest -v
```

Expected: 6 passed (1 route + 5 inspect).

- [ ] **Step 6: Commit**

```bash
git add platform/src/routes/workspace.py platform/tests/test_workspace_route.py
git commit -m "feat(workspace): return per-module files/secrets/packages"
```

---

## Task 5: Update frontend `WorkspaceState` types

Just the types and the API layer — no UI changes yet. After this task, the existing `ContextPanel.tsx` will not type-check; that's expected and gets fixed in the next task.

**Files:**
- Modify: `platform/frontend/src/api/workspace.ts`

- [ ] **Step 1: Replace the contents of `workspace.ts`**

```typescript
import { apiFetch } from "./client";

export interface PackageInfo {
  name: string;
  version: string | null;
  installed: boolean;
}

export interface LoadedModule {
  name: string;
  files: string[];
  secrets: Record<string, string | null>; // null = missing, otherwise masked preview
  packages: PackageInfo[];
}

export interface WorkspaceState {
  modules: LoadedModule[];
}

export function fetchWorkspace(): Promise<WorkspaceState> {
  return apiFetch("/workspace");
}

export interface LoadError {
  module: string;
  reason: "not_available" | "invalid_path" | "missing_secrets" | "load_failed";
  missing?: string[];
  details?: string;
}

export function loadModules(
  modules: string[],
): Promise<{ modules: string[]; errors?: LoadError[] }> {
  return apiFetch("/workspace/load", {
    method: "POST",
    body: JSON.stringify({ modules }),
  });
}

export function refreshSecrets(): Promise<{
  secrets: Record<string, Record<string, string | null>>;
}> {
  return apiFetch("/workspace/secrets", { method: "POST" });
}
```

Notes:
- `loadModules` return shape stays as `{modules: string[]}` because the load endpoint still returns the simple shape — the frontend refetches `GET /api/workspace` after a successful load anyway (existing behavior).
- `refreshSecrets` is unchanged. Its callsite triggers a workspace refetch.

- [ ] **Step 2: Don't try to compile yet — `ContextPanel.tsx` will fail**

This is expected. Move on to the next task. (You can run `pnpm tsc --noEmit` if you want to confirm the only errors are in `ContextPanel.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/api/workspace.ts
git commit -m "feat(api): update WorkspaceState shape for per-module data"
```

---

## Task 6: Create `ModuleCard` component

The single expandable per-module card. Pure presentation — receives a `LoadedModule`, an `expanded` flag, and an `onToggle` callback. No data fetching.

**Files:**
- Create: `platform/frontend/src/components/sidebar/ModuleCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { LoadedModule } from "../../api/workspace";

interface Props {
  module: LoadedModule;
  expanded: boolean;
  onToggle: () => void;
}

function statusOf(m: LoadedModule): "ok" | "warn" {
  const missingSecret = Object.values(m.secrets).some((v) => v === null);
  const failedPackage = m.packages.some((p) => !p.installed);
  return missingSecret || failedPackage ? "warn" : "ok";
}

export function ModuleCard({ module, expanded, onToggle }: Props) {
  const status = statusOf(module);
  const borderClass =
    status === "warn"
      ? "border-amber-500/40"
      : "border-border";
  const dotClass =
    status === "warn"
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]";

  const okSecretCount = Object.values(module.secrets).filter(
    (v) => v !== null,
  ).length;
  const totalSecretCount = Object.keys(module.secrets).length;
  const secretCountLabel =
    okSecretCount === totalSecretCount
      ? `${totalSecretCount}`
      : `${okSecretCount} / ${totalSecretCount}`;
  const secretCountWarn = okSecretCount !== totalSecretCount;

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border bg-bg-raised ${borderClass}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-bg-hover"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span className="flex-1 text-xs font-semibold text-text">
          {module.name}
        </span>
        <span className="text-[10px] text-text-muted">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-dashed border-border bg-black/25 px-3 py-2">
          {module.files.length > 0 && (
            <Section title="📄 FILES" count={`${module.files.length}`}>
              {module.files.map((f) => (
                <Item key={f} name={f} />
              ))}
            </Section>
          )}

          {totalSecretCount > 0 && (
            <Section
              title="🔑 SECRETS"
              count={secretCountLabel}
              warn={secretCountWarn}
            >
              {Object.entries(module.secrets).map(([key, val]) => (
                <Item
                  key={key}
                  name={key}
                  trailing={
                    val === null ? (
                      <span className="rounded border border-red-500/35 bg-red-500/10 px-1.5 py-px text-[9px] text-red-400">
                        missing
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-text-secondary">
                        {val}
                      </span>
                    )
                  }
                />
              ))}
            </Section>
          )}

          {module.packages.length > 0 && (
            <Section title="📦 PACKAGES" count={`${module.packages.length}`}>
              {module.packages.map((p) => (
                <Item
                  key={p.name}
                  name={p.name}
                  trailing={
                    p.installed ? (
                      <span className="font-mono text-[10px] text-text-secondary">
                        {p.version}
                      </span>
                    ) : (
                      <span className="rounded border border-red-500/35 bg-red-500/10 px-1.5 py-px text-[9px] text-red-400">
                        not installed
                      </span>
                    )
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  warn,
  children,
}: {
  title: string;
  count: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 flex items-center justify-between text-[9px] font-semibold tracking-wider text-text-muted">
        <span>{title}</span>
        <span className={`font-mono ${warn ? "text-amber-400" : ""}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Item({
  name,
  trailing,
}: {
  name: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[11px] font-mono">
      <span className="flex-1 truncate text-text">{name}</span>
      {trailing}
    </div>
  );
}
```

Notes for the implementer:
- The Tailwind theme tokens (`bg-bg-raised`, `text-text-muted`, `border-border`, `bg-accent`, etc.) are already used throughout the codebase. Reuse them; don't invent new colors.
- If the project doesn't have `border-amber-500/40` or `text-amber-400` mapped, add the closest existing yellow/amber utility — check `tailwind.config.{js,ts}` first.

- [ ] **Step 2: Make sure the directory exists, then add the file**

```bash
mkdir -p platform/frontend/src/components/sidebar
```

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/components/sidebar/ModuleCard.tsx
git commit -m "feat(sidebar): add ModuleCard component"
```

---

## Task 7: Create `ModuleList` component

Container that owns the per-module expanded state and the load button. Receives the loaded modules, the available module names, the selected set, and the load mutation handlers.

**Files:**
- Create: `platform/frontend/src/components/sidebar/ModuleList.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";

import type { LoadedModule } from "../../api/workspace";
import { ModuleCard } from "./ModuleCard";

interface Props {
  loaded: LoadedModule[];
  available: string[]; // all module names from /api/modules
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onLoad: () => void;
  isLoading: boolean;
  selectionMatchesLoaded: boolean;
  onRefreshSecrets: () => void;
  isRefreshingSecrets: boolean;
}

export function ModuleList({
  loaded,
  available,
  selected,
  onToggleSelect,
  onLoad,
  isLoading,
  selectionMatchesLoaded,
  onRefreshSecrets,
  isRefreshingSecrets,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const loadedNames = new Set(loaded.map((m) => m.name));
  const idleModules = available.filter((n) => !loadedNames.has(n));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">
          MODULES
        </span>
        <button
          type="button"
          onClick={onRefreshSecrets}
          disabled={isRefreshingSecrets}
          className="text-[10px] text-text-secondary hover:text-text"
          title="Re-check Infisical secrets"
        >
          {isRefreshingSecrets ? "…" : "↻"}
        </button>
      </div>

      {loaded.map((m) => (
        <ModuleCard
          key={m.name}
          module={m}
          expanded={expanded.has(m.name)}
          onToggle={() => toggleExpand(m.name)}
        />
      ))}

      {idleModules.map((name) => {
        const isSelected = selected.has(name);
        return (
          <button
            type="button"
            key={name}
            onClick={() => onToggleSelect(name)}
            className={`mb-1 flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-left transition-colors ${
              isSelected
                ? "border-accent/60 bg-accent/10"
                : "border-border opacity-55 hover:opacity-100"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
            <span className="flex-1 text-xs text-text-secondary">{name}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onLoad}
        disabled={
          isLoading ||
          (selectionMatchesLoaded && loaded.length > 0) ||
          (selected.size === 0 && loaded.length === 0)
        }
        className={`mt-2 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
          isLoading
            ? "animate-pulse bg-accent/20 text-accent"
            : selectionMatchesLoaded && loaded.length > 0
              ? "cursor-default border border-accent/20 bg-accent/10 text-accent/70"
              : "bg-accent text-accent-text hover:bg-accent-hover"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        {isLoading
          ? "Loading..."
          : selectionMatchesLoaded && loaded.length > 0
            ? `${loaded.length} Module${loaded.length !== 1 ? "s" : ""} Loaded`
            : "Load Selected"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/components/sidebar/ModuleList.tsx
git commit -m "feat(sidebar): add ModuleList container"
```

---

## Task 8: Refactor `ContextPanel.tsx` to use `ModuleList`

Strip the inline modules + secrets sections from `ContextPanel.tsx`, mount `ModuleList` instead. The Sessions panel and Decision Tree panel are left alone.

**Files:**
- Modify: `platform/frontend/src/components/ContextPanel.tsx`

- [ ] **Step 1: Read the current file once to confirm the existing imports**

```bash
sed -n '1,30p' platform/frontend/src/components/ContextPanel.tsx
```

- [ ] **Step 2: Apply the refactor**

The rewritten file should:

1. Import `ModuleList` from `./sidebar/ModuleList`.
2. Type `workspace?.modules` as `LoadedModule[]` (the API change does this for us).
3. Build `selected` from `workspace.modules.map(m => m.name)` instead of from `workspace.modules` directly.
4. Compute `selectionMatchesLoaded` against the loaded names.
5. Pass `available={modulesData?.modules ?? []}` and `loaded={workspace?.modules ?? []}` to `ModuleList`.
6. **Delete** the entire `{/* Modules */}` section and the entire `{/* Secrets */}` section that currently render inline.
7. Pass `onRefreshSecrets={() => secretsMutation.mutate()}` and `isRefreshingSecrets={secretsMutation.isPending}` into `ModuleList` (the mutation already exists in the file — keep it, just move the trigger).

The Sessions section above and the Decision Tree section below remain untouched.

Final structure of the returned JSX inside `<aside>`:

```tsx
{/* Header — unchanged */}
<div className="px-3.5 py-3 border-b ..."> ... </div>

<div className="flex-1 overflow-y-auto px-2.5 py-2.5">
  {/* Sessions — unchanged */}
  <div className="mb-3"> ... </div>

  {/* Modules — NEW */}
  <div className="mb-3">
    <ModuleList
      loaded={workspace?.modules ?? []}
      available={modulesData?.modules ?? []}
      selected={selected}
      onToggleSelect={toggleModule}
      onLoad={handleLoad}
      isLoading={loadMutation.isPending}
      selectionMatchesLoaded={selectionMatchesLoaded}
      onRefreshSecrets={() => secretsMutation.mutate()}
      isRefreshingSecrets={secretsMutation.isPending}
    />
    {/* loadErrors banner — keep existing logic, render below ModuleList */}
    {loadErrors.length > 0 && (
      <div className="mt-2 ..."> ... </div>
    )}
  </div>

  {/* Decision Tree — unchanged */}
  <div className="pt-3 border-t border-border"> ... </div>
</div>
```

Update the `selected` initialization (the existing render-time `if` block):

```tsx
const loadedNames = (workspace?.modules ?? []).map((m) => m.name);

if (selected.size === 0 && loadedNames.length > 0) {
  setSelected(new Set(loadedNames));
}

const selectionMatchesLoaded =
  selected.size === loadedNames.length &&
  loadedNames.every((n) => selected.has(n));
```

- [ ] **Step 3: Type-check the frontend**

```bash
cd platform/frontend && pnpm tsc --noEmit
```

Expected: no errors. If there are errors, fix them — most likely they're in places that read `workspace.secrets[name]` or assume `modules` is `string[]`. Those should now read from the per-module data inside `LoadedModule` (or be deleted, if they belonged to the old inline secrets section).

- [ ] **Step 4: Run the dev server and verify visually**

```bash
cd platform && uv run start
```

In a second terminal:
```bash
cd platform/frontend && pnpm dev
```

Open the app, load 1-2 modules, expand the cards, confirm:
- Files section lists the right files
- Secrets show masked previews (e.g. `lin▒▒▒▒▒`)
- Packages show versions (or "not installed" in red)
- A module with a missing secret has an amber border + amber dot
- Idle modules render as dashed-border rows; clicking toggles selection
- Load Selected button still works
- Sessions panel and Decision Tree below are untouched

- [ ] **Step 5: Commit**

```bash
git add platform/frontend/src/components/ContextPanel.tsx
git commit -m "feat(sidebar): use ModuleList in ContextPanel, drop inline sections"
```

---

## Task 9: Final regression sweep

- [ ] **Step 1: Run the full backend test suite**

```bash
cd platform && uv run pytest -v
```

Expected: 6 passed (5 inspect + 1 route).

- [ ] **Step 2: Type-check the frontend**

```bash
cd platform/frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test in the dev server**

Walk through these scenarios:
1. Fresh load with no modules selected → ModuleList shows only idle rows.
2. Select 2 modules → click Load → cards appear, Load button changes to "2 Modules Loaded".
3. Expand each card → confirm files/secrets/packages render correctly.
4. Click `↻` to refresh secrets → confirm previews update, no errors in console.
5. Load a module with a missing secret → confirm amber border + amber dot + red `missing` tag inside.
6. Detach a module by deselecting + reloading → card disappears.

- [ ] **Step 4: If everything passes, no further commit needed**

The plan is complete.

---

## Notes for the implementer

- **Don't refactor anything that isn't in the file map.** No incidental cleanups. If you find yourself fixing unrelated things, stop.
- **Re-use existing Tailwind tokens.** The codebase already has a theme — `bg-bg-raised`, `text-text-muted`, `text-accent`, etc. Don't introduce raw hex.
- **The shared `.venv` is intentional.** Don't add per-module venv isolation. The "additive — never cleaned" warning is a known property surfaced via the amber dot only when a real install failure happens.
- **If a section has zero items (e.g. a module with no `requirements.txt`), hide the section entirely.** This is explicit in the spec.
