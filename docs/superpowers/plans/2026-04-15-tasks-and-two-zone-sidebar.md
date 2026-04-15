# Tasks & Two-Zone Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task modules (short-lived working contexts) to Context Agora with a two-zone sidebar that separates always-on integrations from frequently-toggled tasks.

**Architecture:** Extend `ModuleManifest` with `kind` (display hint) and `archived` (lifecycle flag). Enrich the `GET /api/modules` response from `string[]` to `ModuleInfo[]`. Add create-task and archive/unarchive endpoints. Split the sidebar into integrations zone (top, compact) and tasks zone (below, cards with quick-create and archive). All modules remain identical on disk — same symlinks, same git sync, same workspace load.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript with TanStack Query (frontend), Pydantic (models), pytest (backend tests)

**Spec:** `docs/superpowers/specs/2026-04-15-tasks-and-two-zone-sidebar-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `platform/src/services/manifest.py` | Modify | Add `kind` and `archived` to `ModuleManifest`; update `write_manifest` |
| `platform/src/services/schemas.py` | Modify | Allow `status.md` in file path validation |
| `platform/src/models.py` | Modify | Add `ModuleInfo`, `CreateTaskRequest` models |
| `platform/src/routes/modules.py` | Modify | Enrich `GET /api/modules`; add create-task, archive, unarchive endpoints |
| `platform/src/routes/workspace.py` | Modify | Extract workspace load logic into reusable `reload_workspace` function |
| `platform/tests/test_manifest.py` | Create | Tests for manifest `kind`/`archived` read/write |
| `platform/tests/test_schemas.py` | Create | Tests for `status.md` file path validation |
| `platform/tests/test_task_scaffolding.py` | Create | Tests for task slug generation and file scaffolding |
| `platform/frontend/src/api/modules.ts` | Modify | Update types and fetch functions for `ModuleInfo[]` response |
| `platform/frontend/src/components/ContextPanel.tsx` | Modify | Split modules by `kind`; pass integrations and tasks to separate zones |
| `platform/frontend/src/components/sidebar/ModuleList.tsx` | Modify | Accept `ModuleInfo[]` instead of `string[]` for available modules |
| `platform/frontend/src/components/sidebar/IdleModuleCard.tsx` | Modify | Accept `ModuleInfo` instead of `string` for unloaded modules |
| `platform/frontend/src/components/sidebar/TaskZone.tsx` | Create | Tasks zone with load/unload, archive, "New Task" button |
| `platform/frontend/src/components/sidebar/TaskCard.tsx` | Create | Card for a single task (loaded or idle) with archive button |
| `platform/frontend/src/components/sidebar/CreateTaskModal.tsx` | Create | Modal for quick task creation (name + description) |
| `platform/frontend/src/components/sidebar/ArchivedSection.tsx` | Create | Collapsible section listing archived tasks with unarchive action |
| `platform/frontend/src/components/Chat.tsx` | Modify | Update `modules: string[]` usage to extract names from `ModuleInfo[]` |
| `platform/frontend/src/components/ModuleDashboard.tsx` | Modify | Update `modules: string[]` usage to extract names from `ModuleInfo[]` |
| `platform/frontend/src/utils/humanizeToolCall.ts` | No change | Receives module names from workspace API, not modules API |

---

## Task 1: Extend ModuleManifest with `kind` and `archived`

**Files:**
- Modify: `platform/src/services/manifest.py:14-19` (ModuleManifest class)
- Modify: `platform/src/services/manifest.py:64-76` (write_manifest function)
- Create: `platform/tests/test_manifest.py`

- [ ] **Step 1: Write tests for manifest changes**

Create `platform/tests/test_manifest.py`:

```python
import tempfile
from pathlib import Path

import yaml

from src.services.manifest import ModuleManifest, read_manifest, write_manifest


def test_manifest_defaults():
    """New fields default correctly."""
    m = ModuleManifest(name="test")
    assert m.kind == "integration"
    assert m.archived is False


def test_read_manifest_with_kind_and_archived(tmp_path):
    """read_manifest picks up kind and archived from YAML."""
    (tmp_path / "module.yaml").write_text(
        yaml.dump({"name": "foo", "kind": "task", "archived": True})
    )
    m = read_manifest(tmp_path)
    assert m.kind == "task"
    assert m.archived is True


def test_read_manifest_defaults_without_new_fields(tmp_path):
    """Existing module.yaml without kind/archived gets defaults."""
    (tmp_path / "module.yaml").write_text(yaml.dump({"name": "foo"}))
    m = read_manifest(tmp_path)
    assert m.kind == "integration"
    assert m.archived is False


def test_write_manifest_omits_defaults(tmp_path):
    """write_manifest omits kind=integration and archived=False."""
    m = ModuleManifest(name="foo", summary="test")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "kind" not in raw
    assert "archived" not in raw


def test_write_manifest_includes_non_defaults(tmp_path):
    """write_manifest includes kind=task and archived=True."""
    m = ModuleManifest(name="foo", kind="task", archived=True)
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["kind"] == "task"
    assert raw["archived"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_manifest.py -v`
Expected: FAIL — `ModuleManifest` doesn't have `kind` or `archived` fields yet

- [ ] **Step 3: Add `kind` and `archived` to ModuleManifest**

In `platform/src/services/manifest.py`, update the `ModuleManifest` class:

```python
class ModuleManifest(BaseModel):
    name: str
    kind: str = "integration"   # "integration" | "task"
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []
    archived: bool = False
```

- [ ] **Step 4: Update `write_manifest` to conditionally include new fields**

In `platform/src/services/manifest.py`, update `write_manifest`:

```python
def write_manifest(module_dir: Path, manifest: ModuleManifest) -> None:
    """Write a ModuleManifest to module.yaml, omitting empty optional fields."""
    data: dict = {"name": manifest.name}
    if manifest.kind != "integration":
        data["kind"] = manifest.kind
    if manifest.summary:
        data["summary"] = manifest.summary
    if manifest.secrets:
        data["secrets"] = manifest.secrets
    if manifest.dependencies:
        data["dependencies"] = manifest.dependencies
    if manifest.archived:
        data["archived"] = manifest.archived
    (module_dir / "module.yaml").write_text(
        yaml.dump(data, default_flow_style=False, sort_keys=False)
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_manifest.py -v`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add platform/src/services/manifest.py platform/tests/test_manifest.py
git commit -m "feat(manifest): add kind and archived fields to ModuleManifest"
```

---

## Task 2: Update file path validation for `status.md`

**Files:**
- Modify: `platform/src/services/schemas.py:27-31`
- Create: `platform/tests/test_schemas.py`

- [ ] **Step 1: Write tests for status.md validation**

Create `platform/tests/test_schemas.py`:

```python
import pytest

from src.services.schemas import validate_module_file_path

MANAGED_FILES = frozenset({"module.yaml", "llms.txt"})


def test_info_md_allowed():
    assert validate_module_file_path("info.md", MANAGED_FILES) == "info.md"


def test_status_md_allowed():
    assert validate_module_file_path("status.md", MANAGED_FILES) == "status.md"


def test_docs_subdir_allowed():
    assert validate_module_file_path("docs/guide.md", MANAGED_FILES) == "docs/guide.md"


def test_random_root_file_rejected():
    with pytest.raises(ValueError, match="Only"):
        validate_module_file_path("random.txt", MANAGED_FILES)


def test_managed_file_rejected():
    with pytest.raises(ValueError, match="managed"):
        validate_module_file_path("module.yaml", MANAGED_FILES)
```

- [ ] **Step 2: Run tests to verify `status.md` test fails**

Run: `cd platform && uv run pytest tests/test_schemas.py -v`
Expected: `test_status_md_allowed` FAILS, others pass

- [ ] **Step 3: Update validation to allow `status.md`**

In `platform/src/services/schemas.py`, change line 27-28:

```python
# Before:
    if file_path == "info.md":
        return file_path

# After:
    if file_path in ("info.md", "status.md"):
        return file_path
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_schemas.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/schemas.py platform/tests/test_schemas.py
git commit -m "feat(schemas): allow status.md in module file path validation"
```

---

## Task 3: Add API models and enrich `GET /api/modules`

**Files:**
- Modify: `platform/src/models.py`
- Modify: `platform/src/routes/modules.py:33-36` (api_list_modules)
- Modify: `platform/src/routes/modules.py:126-129` (api_refresh_modules)

- [ ] **Step 1: Add `ModuleInfo` and `CreateTaskRequest` to models.py**

In `platform/src/models.py`, add at the end:

```python
class ModuleInfo(BaseModel):
    name: str
    kind: str = "integration"
    summary: str = ""
    archived: bool = False


class CreateTaskRequest(BaseModel):
    name: str
    description: str = ""
```

- [ ] **Step 2: Update `api_list_modules` to return `ModuleInfo` objects**

In `platform/src/routes/modules.py`, update the import to include `ModuleInfo`:

```python
from src.models import (
    CreateModuleRequest,
    CreateTaskRequest,
    FileContentRequest,
    GenerateModuleRequest,
    GenerateModuleResponse,
    ModuleInfo,
    UpdateModuleRequest,
)
```

Then update the endpoint:

```python
@router.get("")
async def api_list_modules():
    """List available modules from the local clone."""
    modules = []
    for name in git_repo.list_modules():
        manifest = read_manifest(git_repo.module_dir(name))
        modules.append(ModuleInfo(
            name=name,
            kind=manifest.kind,
            summary=manifest.summary,
            archived=manifest.archived,
        ))
    return {"modules": modules}
```

Also update `api_refresh_modules` (currently at line 126) to return the same shape:

```python
@router.post("/refresh")
async def api_refresh_modules():
    """Kept for frontend compatibility. Local clone listing is always fresh."""
    return await api_list_modules()
```

- [ ] **Step 3: Verify backend starts**

Run: `cd platform && uv run python -c "from src.routes.modules import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add platform/src/models.py platform/src/routes/modules.py
git commit -m "feat(api): enrich GET /api/modules to return ModuleInfo objects"
```

---

## Task 4: Extract reusable workspace reload function

The archive and create-task endpoints both need to reload the workspace (add or remove a module from the loaded set). The current load logic lives inline in the `api_workspace_load` endpoint handler. Extract it into a reusable function.

**Files:**
- Modify: `platform/src/routes/workspace.py:78-165`

- [ ] **Step 1: Extract `reload_workspace` function**

In `platform/src/routes/workspace.py`, extract the load logic into a standalone function that takes a list of module names and returns the result dict. The existing endpoint becomes a thin wrapper:

```python
def _get_loaded_module_names() -> list[str]:
    """Return names of currently loaded modules in context/."""
    return _list_modules(settings.CONTEXT_DIR)


def reload_workspace(module_names: list[str]) -> dict:
    """Clear workspace and (re)link selected modules into context/.

    Returns {"modules": [...loaded names...], "errors": [...]} dict.
    """
    # 1. Clear context/
    for p in settings.CONTEXT_DIR.iterdir():
        if p.is_symlink():
            p.unlink()
        elif p.is_dir():
            shutil.rmtree(p)
        elif p.is_file() and p.name not in settings.PRESERVED_FILES:
            p.unlink()

    # 2. Link preserved dirs
    for dirname in PRESERVED_DIRS:
        if git_repo.module_exists(dirname):
            try:
                src = settings.MODULES_REPO_DIR / dirname
                (settings.CONTEXT_DIR / dirname).symlink_to(src, target_is_directory=True)
            except (OSError, ValueError) as exc:
                log.warning("Failed to link preserved dir '%s': %s", dirname, exc)

    available = set(git_repo.list_modules()) | set(PRESERVED_DIRS)
    loaded: list[str] = []
    errors: list[dict] = []

    for name in module_names:
        if name not in available:
            errors.append({"module": name, "reason": "not_available"})
            continue

        link_path = settings.CONTEXT_DIR / name
        try:
            link_path.resolve().relative_to(settings.CONTEXT_DIR.resolve())
        except ValueError:
            errors.append({"module": name, "reason": "invalid_path"})
            continue

        try:
            target = settings.MODULES_REPO_DIR / name
            if not target.is_dir():
                raise FileNotFoundError(f"Module '{name}' not found in clone")
            link_path.symlink_to(target, target_is_directory=True)
            loaded.append(name)
        except (OSError, ValueError, FileNotFoundError) as exc:
            log.error("Failed to load module '%s': %s", name, exc)
            if link_path.is_symlink() or link_path.exists():
                try:
                    link_path.unlink()
                except OSError:
                    pass
            errors.append({
                "module": name,
                "reason": "load_failed",
                "details": str(exc),
            })

    generate_root_llms_txt(settings.CONTEXT_DIR)

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

    response: dict = {"modules": loaded}
    if errors:
        response["errors"] = errors
    return response


@router.post("/load")
async def api_workspace_load(body: WorkspaceLoadRequest):
    """Clear workspace and (re)link selected modules into context/."""
    return reload_workspace(body.modules)
```

- [ ] **Step 2: Verify the refactor doesn't break the existing endpoint**

Run: `cd platform && uv run python -c "from src.routes.workspace import reload_workspace, _get_loaded_module_names; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add platform/src/routes/workspace.py
git commit -m "refactor(workspace): extract reload_workspace for reuse by task endpoints"
```

---

## Task 5: Add archive/unarchive and create-task endpoints

**Files:**
- Modify: `platform/src/routes/modules.py`
- Create: `platform/tests/test_task_scaffolding.py`

- [ ] **Step 1: Write test for slug generation**

Create `platform/tests/test_task_scaffolding.py`:

```python
from src.routes.modules import slugify_task_name


def test_slugify_basic():
    assert slugify_task_name("Tax Correction") == "tax-correction"


def test_slugify_mixed_case():
    assert slugify_task_name("Stealth TicketBAI Errors") == "stealth-ticketbai-errors"


def test_slugify_underscores():
    assert slugify_task_name("maat_stripe_migration") == "maat-stripe-migration"


def test_slugify_special_chars():
    assert slugify_task_name("fix: bug #123") == "fix-bug-123"


def test_slugify_collapse_hyphens():
    assert slugify_task_name("foo - - bar") == "foo-bar"


def test_slugify_strip_edges():
    assert slugify_task_name("  hello world  ") == "hello-world"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform && uv run pytest tests/test_task_scaffolding.py -v`
Expected: FAIL — `slugify_task_name` doesn't exist yet

- [ ] **Step 3: Add `slugify_task_name` function**

In `platform/src/routes/modules.py`, add near the top (after imports):

```python
import re as _re

def slugify_task_name(name: str) -> str:
    """Convert a human task name to a folder-safe slug."""
    slug = name.strip().lower()
    slug = slug.replace("_", "-")
    slug = _re.sub(r"[^a-z0-9-]", "-", slug)
    slug = _re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug
```

- [ ] **Step 4: Run slug tests to verify they pass**

Run: `cd platform && uv run pytest tests/test_task_scaffolding.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Add archive/unarchive endpoints**

In `platform/src/routes/modules.py`, add these endpoints. They must be placed **before** the `/{name}` routes to avoid routing conflicts. Add them right after the `api_list_modules` endpoint and before `api_get_module`:

```python
from src.routes.workspace import reload_workspace, _get_loaded_module_names


@router.post("/create-task", status_code=201)
async def api_create_task(body: CreateTaskRequest):
    """Scaffold a new task module and auto-load it."""
    slug = slugify_task_name(body.name)
    slug = validate_module_name(slug)

    try:
        git_repo.create_module_dir(slug)
    except FileExistsError:
        return JSONResponse(
            {"error": f"Module '{slug}' already exists"}, status_code=409
        )

    title = body.name.strip()
    description = body.description.strip() if body.description else ""
    summary = description or title

    # module.yaml
    manifest = ModuleManifest(name=slug, kind="task", summary=summary)
    write_manifest(git_repo.module_dir(slug), manifest)

    # info.md
    info_lines = [f"# {title}", ""]
    if description:
        info_lines.append(description)
    git_repo.write_file(slug, "info.md", "\n".join(info_lines) + "\n")

    # status.md
    from datetime import date
    status_lines = [
        f"# {title} — Status",
        "",
        f"**Created:** {date.today().isoformat()}",
        "",
        "## Context",
        summary,
        "",
        "## Next Steps",
        "- ",
    ]
    git_repo.write_file(slug, "status.md", "\n".join(status_lines) + "\n")

    # llms.txt
    llms_lines = [
        f"# {title}",
        f"> {summary}",
        "",
        "## Status",
        f"- [status.md](status.md) — Current status and next steps",
    ]
    git_repo.write_file(slug, "llms.txt", "\n".join(llms_lines) + "\n")

    # Auto-load: add to current workspace
    current = _get_loaded_module_names()
    if slug not in current:
        current.append(slug)
    reload_workspace(current)

    return {"name": slug}


@router.post("/{name}/archive")
async def api_archive_module(name: str):
    """Set archived=true on a module and unload it if loaded."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    manifest = read_manifest(git_repo.module_dir(name))
    manifest = manifest.model_copy(update={"archived": True})
    write_manifest(git_repo.module_dir(name), manifest)

    # Unload if currently loaded
    current = _get_loaded_module_names()
    if name in current:
        current.remove(name)
        reload_workspace(current)

    return {"status": "ok"}


@router.post("/{name}/unarchive")
async def api_unarchive_module(name: str):
    """Set archived=false on a module."""
    if not git_repo.module_exists(name):
        return JSONResponse({"error": f"Module '{name}' not found"}, status_code=404)

    manifest = read_manifest(git_repo.module_dir(name))
    manifest = manifest.model_copy(update={"archived": False})
    write_manifest(git_repo.module_dir(name), manifest)

    return {"status": "ok"}
```

- [ ] **Step 6: Verify imports and endpoint registration**

Run: `cd platform && uv run python -c "from src.routes.modules import router; print([r.path for r in router.routes])"`
Expected: List of routes including `/create-task`, `/{name}/archive`, `/{name}/unarchive`

- [ ] **Step 7: Commit**

```bash
git add platform/src/routes/modules.py platform/tests/test_task_scaffolding.py
git commit -m "feat(api): add create-task, archive, and unarchive endpoints"
```

---

## Task 6: Update frontend API client for new response shape

**Files:**
- Modify: `platform/frontend/src/api/modules.ts`

- [ ] **Step 1: Add `ModuleInfo` type and update fetch functions**

Update `platform/frontend/src/api/modules.ts`:

```typescript
import { apiFetch } from "./client";

export interface ModuleInfo {
  name: string;
  kind: "integration" | "task";
  summary: string;
  archived: boolean;
}

export interface ModuleDetail {
  name: string;
  content: string;
  summary: string;
  secrets: string[];
  requirements: string[];
}

export function fetchModules(): Promise<{ modules: ModuleInfo[] }> {
  return apiFetch("/modules");
}

export function fetchModule(name: string): Promise<ModuleDetail> {
  return apiFetch(`/modules/${name}`);
}

export function createModule(data: {
  name: string;
  content: string;
  summary: string;
  secrets: string[];
  requirements: string[];
}): Promise<{ name: string }> {
  return apiFetch("/modules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function createTask(data: {
  name: string;
  description?: string;
}): Promise<{ name: string }> {
  return apiFetch("/modules/create-task", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function archiveModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}/archive`, { method: "POST" });
}

export function unarchiveModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}/unarchive`, { method: "POST" });
}

export function updateModule(
  name: string,
  data: { content: string; summary: string; secrets: string[]; requirements: string[] },
): Promise<{ name: string }> {
  return apiFetch(`/modules/${name}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteModule(name: string): Promise<{ status: string }> {
  return apiFetch(`/modules/${name}`, { method: "DELETE" });
}

export function refreshModules(): Promise<{ modules: ModuleInfo[] }> {
  return apiFetch("/modules/refresh", { method: "POST" });
}

// --- Module file operations ---
// (keep all existing file operations unchanged)
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/api/modules.ts
git commit -m "feat(frontend): update modules API client for ModuleInfo response"
```

---

## Task 7: Update all frontend consumers of modules API

The `GET /api/modules` response changed from `{ modules: string[] }` to `{ modules: ModuleInfo[] }`. Every consumer that used `string[]` must now extract `.name` from the objects.

**Files:**
- Modify: `platform/frontend/src/components/ContextPanel.tsx:128,136`
- Modify: `platform/frontend/src/components/Chat.tsx:35,39`
- Modify: `platform/frontend/src/components/ModuleDashboard.tsx:20-28`

- [ ] **Step 1: Update ContextPanel.tsx**

In `platform/frontend/src/components/ContextPanel.tsx`:

Add import for `ModuleInfo`:
```typescript
import { fetchModules, type ModuleInfo } from "../api/modules";
```

Change line 128 from:
```typescript
const modules = modulesData?.modules || [];           // string[] — all available
```
to:
```typescript
const allModuleInfos: ModuleInfo[] = modulesData?.modules || [];
const modules = allModuleInfos.map((m) => m.name);   // string[] for selection logic
```

Update line 136 — the fresh-start fallback should default to integration modules only, not tasks:
```typescript
const selected: Set<string> =
  userSelection ??
  (loadedNames.length > 0
    ? new Set(loadedNames)
    : new Set(allModuleInfos.filter((m) => m.kind === "integration").map((m) => m.name)));
```

- [ ] **Step 2: Update Chat.tsx**

In `platform/frontend/src/components/Chat.tsx`:

Change line 38-39 from:
```typescript
const allModules = modulesData?.modules || [];
```
to:
```typescript
const allModules = (modulesData?.modules || []).map((m) => m.name);
```

- [ ] **Step 3: Update ModuleDashboard.tsx**

In `platform/frontend/src/components/ModuleDashboard.tsx`:

Change line 20 from:
```typescript
const modules = modulesData?.modules || [];
```
to:
```typescript
const modules = (modulesData?.modules || []).map((m) => m.name);
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd platform/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add platform/frontend/src/components/ContextPanel.tsx platform/frontend/src/components/Chat.tsx platform/frontend/src/components/ModuleDashboard.tsx
git commit -m "fix(frontend): update all consumers for ModuleInfo[] response shape"
```

---

## Task 8: Create TaskCard component

**Files:**
- Create: `platform/frontend/src/components/sidebar/TaskCard.tsx`

- [ ] **Step 1: Create TaskCard component**

Create `platform/frontend/src/components/sidebar/TaskCard.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveModule } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";

interface Props {
  name: string;
  summary: string;
  loaded: LoadedModule | null;   // null = not loaded
  selected: boolean;
  onToggleSelect: () => void;
}

export function TaskCard({ name, summary, loaded, selected, onToggleSelect }: Props) {
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: () => archiveModule(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const isLoaded = loaded !== null;
  const borderClass = isLoaded
    ? "border-accent/70"
    : selected
      ? "border-accent/50"
      : "border-dashed border-border";
  const bgClass = isLoaded
    ? "bg-accent/[0.10]"
    : "bg-bg-hover";
  const dotClass = isLoaded
    ? "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]"
    : "bg-text-muted";

  return (
    <div className={`mb-1.5 overflow-hidden rounded-md border ${bgClass} ${borderClass}`}>
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 accent-accent"
        />
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-text block truncate">{name}</span>
          {summary && (
            <span className="text-[10px] text-text-muted block truncate">{summary}</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            archiveMutation.mutate();
          }}
          disabled={archiveMutation.isPending}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-hover transition-colors opacity-0 group-hover:opacity-100"
          style={{ opacity: 1 }}
          title="Archive task"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/components/sidebar/TaskCard.tsx
git commit -m "feat(frontend): add TaskCard component for tasks zone"
```

---

## Task 9: Create CreateTaskModal component

**Files:**
- Create: `platform/frontend/src/components/sidebar/CreateTaskModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `platform/frontend/src/components/sidebar/CreateTaskModal.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTask } from "../../api/modules";

interface Props {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createTask({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-files"] });
      queryClient.invalidateQueries({ queryKey: ["root-context"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) mutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-border bg-bg-raised p-4 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-text mb-3">New Task</h3>

        <label className="block mb-3">
          <span className="text-[11px] text-text-muted mb-1 block">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tax Correction"
            autoFocus
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-4">
          <span className="text-[11px] text-text-muted mb-1 block">
            Description <span className="text-text-muted/60">(optional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this task about?"
            rows={2}
            className="w-full rounded border border-border bg-bg px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || mutation.isPending}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>

        {mutation.isError && (
          <p className="mt-2 text-[10px] text-red-400">
            Failed to create task. Try a different name.
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/components/sidebar/CreateTaskModal.tsx
git commit -m "feat(frontend): add CreateTaskModal component"
```

---

## Task 10: Create ArchivedSection component

**Files:**
- Create: `platform/frontend/src/components/sidebar/ArchivedSection.tsx`

- [ ] **Step 1: Create the component**

Create `platform/frontend/src/components/sidebar/ArchivedSection.tsx`:

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unarchiveModule, type ModuleInfo } from "../../api/modules";

interface Props {
  tasks: ModuleInfo[];
}

export function ArchivedSection({ tasks }: Props) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] text-text-muted hover:text-text transition-colors"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span className="tracking-wider">ARCHIVED</span>
        <span className="ml-auto font-mono text-[9px]">{tasks.length}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {tasks.map((t) => (
            <ArchivedTaskRow key={t.name} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivedTaskRow({ task }: { task: ModuleInfo }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unarchiveModule(task.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modules"] });
    },
  });

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover">
      <span className="flex-1 truncate">{task.name}</span>
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="text-[10px] text-accent hover:text-accent-hover disabled:opacity-50"
      >
        {mutation.isPending ? "..." : "unarchive"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add platform/frontend/src/components/sidebar/ArchivedSection.tsx
git commit -m "feat(frontend): add ArchivedSection component"
```

---

## Task 11: Create TaskZone component and wire up two-zone sidebar

This is the main integration task. The TaskZone component renders the tasks section (New Task button, task cards, load button, archived section). The ContextPanel splits modules by `kind` and renders two zones.

**Files:**
- Create: `platform/frontend/src/components/sidebar/TaskZone.tsx`
- Modify: `platform/frontend/src/components/ContextPanel.tsx`
- Modify: `platform/frontend/src/components/sidebar/ModuleList.tsx`

- [ ] **Step 1: Create TaskZone component**

Create `platform/frontend/src/components/sidebar/TaskZone.tsx`:

```tsx
import { useState } from "react";
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { TaskCard } from "./TaskCard";
import { ArchivedSection } from "./ArchivedSection";
import { CreateTaskModal } from "./CreateTaskModal";

interface Props {
  tasks: ModuleInfo[];              // active (non-archived) task ModuleInfos
  archivedTasks: ModuleInfo[];      // archived task ModuleInfos
  loaded: LoadedModule[];           // currently loaded modules (all kinds)
  selected: Set<string>;
  onToggleSelect: (name: string) => void;
  onLoad: () => void;
  isLoading: boolean;
  selectionMatchesLoaded: boolean;
}

export function TaskZone({
  tasks,
  archivedTasks,
  loaded,
  selected,
  onToggleSelect,
  onLoad,
  isLoading,
  selectionMatchesLoaded,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const loadedMap = new Map(loaded.map((m) => [m.name, m]));

  // Count how many tasks are selected vs loaded (for button state)
  const taskNames = tasks.map((t) => t.name);
  const hasTaskChanges = taskNames.some((n) => {
    const isSelected = selected.has(n);
    const isLoaded = loadedMap.has(n);
    return isSelected !== isLoaded;
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">TASKS</span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 rounded border border-border bg-bg-raised px-1.5 py-0.5 text-[9px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
        >
          + New Task
        </button>
      </div>

      {tasks.length === 0 && !showCreate && (
        <p className="px-1.5 py-2 text-[10px] italic text-text-muted">
          No active tasks. Click "+ New Task" to create one.
        </p>
      )}

      {tasks.map((t) => (
        <TaskCard
          key={t.name}
          name={t.name}
          summary={t.summary}
          loaded={loadedMap.get(t.name) ?? null}
          selected={selected.has(t.name)}
          onToggleSelect={() => onToggleSelect(t.name)}
        />
      ))}

      {tasks.length > 0 && hasTaskChanges && (
        <button
          type="button"
          onClick={onLoad}
          disabled={isLoading}
          className={`mt-1 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
            isLoading
              ? "animate-pulse bg-accent/20 text-accent"
              : "bg-accent text-accent-text hover:bg-accent-hover"
          } disabled:cursor-not-allowed disabled:opacity-30`}
        >
          {isLoading ? "Loading..." : "Apply Changes"}
        </button>
      )}

      <ArchivedSection tasks={archivedTasks} />
      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Update ModuleList to filter out tasks**

In `platform/frontend/src/components/sidebar/ModuleList.tsx`, update the `Props` interface to accept `ModuleInfo[]` for available modules instead of `string[]`, then filter to integrations only:

```tsx
import type { ModuleInfo } from "../../api/modules";
import type { LoadedModule } from "../../api/workspace";
import { IdleModuleCard } from "./IdleModuleCard";
import { ModuleCard } from "./ModuleCard";

interface Props {
  loaded: LoadedModule[];
  available: ModuleInfo[];          // changed from string[]
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
  // Only show integration modules in this zone
  const integrations = available.filter((m) => m.kind === "integration" && !m.archived);
  const integrationNames = new Set(integrations.map((m) => m.name));
  const loadedIntegrations = loaded.filter((m) => integrationNames.has(m.name));
  const loadedNames = new Set(loadedIntegrations.map((m) => m.name));
  const idleModules = integrations.filter((m) => !loadedNames.has(m.name));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wider text-text-muted">
          INTEGRATIONS
        </span>
        <button
          type="button"
          onClick={onRefreshSecrets}
          disabled={isRefreshingSecrets}
          className="flex items-center gap-1 rounded border border-border bg-bg-raised px-1.5 py-0.5 text-[9px] text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
          title="Re-fetch secrets from Infisical for all loaded modules"
        >
          <span className={isRefreshingSecrets ? "animate-spin" : ""}>↻</span>
          <span>{isRefreshingSecrets ? "checking…" : "Re-check secrets"}</span>
        </button>
      </div>

      {loadedIntegrations.map((m) => {
        const isSelected = selected.has(m.name);
        return (
          <ModuleCard
            key={m.name}
            module={m}
            expanded={isSelected}
            selected={isSelected}
            onToggleExpand={() => onToggleSelect(m.name)}
            onToggleSelect={() => onToggleSelect(m.name)}
          />
        );
      })}

      {idleModules.map((m) => (
        <IdleModuleCard
          key={m.name}
          name={m.name}
          selected={selected.has(m.name)}
          onToggleSelect={() => onToggleSelect(m.name)}
        />
      ))}

      <button
        type="button"
        onClick={onLoad}
        disabled={
          isLoading ||
          (selectionMatchesLoaded && loadedIntegrations.length > 0) ||
          (selected.size === 0 && loadedIntegrations.length === 0)
        }
        className={`mt-2 w-full rounded-md py-1.5 text-xs font-medium transition-all ${
          isLoading
            ? "animate-pulse bg-accent/20 text-accent"
            : selectionMatchesLoaded && loadedIntegrations.length > 0
              ? "cursor-default border border-accent/20 bg-accent/10 text-accent/70"
              : "bg-accent text-accent-text hover:bg-accent-hover"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        {isLoading
          ? "Loading..."
          : selectionMatchesLoaded && loadedIntegrations.length > 0
            ? `${loadedIntegrations.length} Loaded`
            : selected.size === 0 && loadedIntegrations.length > 0
              ? "Unload All"
              : "Load Selected"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update ContextPanel to render two zones**

In `platform/frontend/src/components/ContextPanel.tsx`, add the TaskZone import and split module data:

Add import:
```typescript
import { TaskZone } from "./sidebar/TaskZone";
import type { ModuleInfo } from "../api/modules";
```

Task 7 already introduced `allModuleInfos` and `modules`. Now add the task filters after those lines:

```typescript
// Split by kind for two-zone rendering (add after existing allModuleInfos/modules lines)
const activeTasks = allModuleInfos.filter((m) => m.kind === "task" && !m.archived);
const archivedTasks = allModuleInfos.filter((m) => m.kind === "task" && m.archived);
```

Then in the JSX, inside `{tab === "context" && (`, after `<ModuleList ... />`, add the TaskZone:

```tsx
{tab === "context" && (
  <div>
    <RootSection />
    <ModuleList
      loaded={loaded}
      available={allModuleInfos}
      selected={selected}
      onToggleSelect={toggleModule}
      onLoad={handleLoad}
      isLoading={loadMutation.isPending}
      selectionMatchesLoaded={selectionMatchesLoaded}
      onRefreshSecrets={() => secretsMutation.mutate()}
      isRefreshingSecrets={secretsMutation.isPending}
    />

    {/* Divider between zones */}
    <div className="my-3 border-t border-border" />

    <TaskZone
      tasks={activeTasks}
      archivedTasks={archivedTasks}
      loaded={loaded}
      selected={selected}
      onToggleSelect={toggleModule}
      onLoad={handleLoad}
      isLoading={loadMutation.isPending}
      selectionMatchesLoaded={selectionMatchesLoaded}
    />

    {loadErrors.length > 0 && (
      /* ... existing error display ... */
    )}
    <SyncControls />
  </div>
)}
```

Note: The `selected` set and `handleLoad` are shared between both zones. When the user clicks "Load Selected" or "Apply Changes" in either zone, the full selected set (integrations + tasks) is sent to the workspace load endpoint.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd platform/frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add platform/frontend/src/components/sidebar/TaskZone.tsx platform/frontend/src/components/sidebar/ModuleList.tsx platform/frontend/src/components/ContextPanel.tsx
git commit -m "feat(frontend): two-zone sidebar with integrations and tasks zones"
```

---

## Task 12: Manual integration test

Verify the full flow works end-to-end.

**Files:** None (manual testing)

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/bsampera/Documents/bleak-dev/context-loader && docker compose up --build`

- [ ] **Step 2: Verify existing modules show in integrations zone**

Open `http://localhost:8080`. The sidebar should show existing modules under "INTEGRATIONS" (not "MODULES"). Load/unload should work as before.

- [ ] **Step 3: Create a task**

Click "+ New Task" in the tasks zone. Enter name "Tax Correction" and description "Fix wrong tax-inclusive invoices". Click Create. Verify:
- Task appears in the tasks zone
- It's auto-loaded (accent border, green dot)
- The module folder exists in `modules-repo/tax-correction/` with `module.yaml`, `info.md`, `status.md`, `llms.txt`

- [ ] **Step 4: Archive the task**

Click the archive icon on the tax-correction task card. Verify:
- Task disappears from the active tasks list
- Task appears in the "ARCHIVED" section at the bottom
- Task is unloaded from the workspace

- [ ] **Step 5: Unarchive the task**

Expand the "ARCHIVED" section. Click "unarchive" on tax-correction. Verify:
- Task reappears in the active tasks zone (unloaded)
- Can be re-loaded by checking and clicking Load

- [ ] **Step 6: Verify git sync**

After creating a task, check the sync controls. The new task module should show as dirty (uncommitted changes in the local clone). Push should work normally.

- [ ] **Step 7: Run all backend tests**

Run: `cd platform && uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 8: Commit any fixes from testing**

If any issues were found during testing, fix them and commit:
```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```
