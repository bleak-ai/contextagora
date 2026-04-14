# Tasks & Two-Zone Sidebar Design

## Problem

Context Agora's module system works well for integrations (Linear, Stripe, Slack) — you load them once and they stay ambient. But users also need **short-lived working contexts** for specific problems: investigating a customer issue, coordinating a migration, drafting communications. These "tasks" have fundamentally different interaction patterns from integrations:

- Integrations are set-and-forget. Tasks are toggled constantly.
- Integrations are permanent. Tasks have unpredictable lifecycles — some resolve in hours, some go dormant for weeks and resurface.
- Task folders are shared workspaces: the user brings in files (CSVs, emails), the AI generates files (scripts, drafts, analysis). Both contribute.
- The primary consumer of task context is the AI — the user remembers what's going on, but the AI needs the files loaded to pick up where things left off.
- Task volume is unpredictable (1 to 5+ active at a time).

The current flat module list doesn't reflect this difference. With 4 integrations and 5 tasks in one list, you're scanning past ambient tools every time you want to toggle a task.

## Design Constraints (from user Q&A)

- No type taxonomy that drives system behavior — `kind` is a display hint only
- Archive must be reversible (tasks go dormant and resurface)
- Quick-create is the highest-value feature (reduce friction to start a task)
- Integrations stay always-loaded; tasks come and go on top
- The support workflow module is orthogonal — just a module you load, no special treatment
- The AI doesn't need special prompt injection — loading the task's files is enough

## Solution: Two-Zone Sidebar + Task Lifecycle

### 1. Data Model

Two new fields in `ModuleManifest` (`platform/src/services/manifest.py`):

```python
class ModuleManifest(BaseModel):
    name: str
    kind: str = "integration"   # "integration" | "task"
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []
    archived: bool = False
```

- **`kind`**: Display hint. Determines which sidebar zone renders the module. Defaults to `"integration"` — all existing modules work without changes.
- **`archived`**: Filters the module from the active UI. Reversible boolean. Defaults to `false`.

`write_manifest` omits `kind` when `"integration"` and `archived` when `false`, keeping existing `module.yaml` files untouched. Note: `kind="integration"` is truthy, so `write_manifest` needs an explicit `if manifest.kind != "integration":` check (not the truthiness pattern used for other fields).

### 2. Task Module Structure

A task module is a regular module folder with a conventional file structure:

```
tax-correction/
├── module.yaml        # kind: task, summary
├── info.md            # task description (required — module detail endpoint reads this)
├── llms.txt           # index of contents (for AI navigation)
├── status.md          # current state and next steps
└── ...                # investigation notes, scripts, CSVs, drafts — whatever accumulates
```

Task modules include an `info.md` because the existing module detail endpoint (`GET /api/modules/{name}`) reads it and returns 404 if missing. For tasks, `info.md` contains the task description — functionally equivalent to an integration's service documentation but focused on the problem being solved.

Example `module.yaml`:
```yaml
name: tax-correction
kind: task
summary: "Fix wrong tax-inclusive invoices via Invopop"
```

Example `info.md`:
```markdown
# Tax Correction

Fix wrong tax-inclusive invoices via Invopop. Prices are tax-inclusive (gross)
but the mapper sent them as net amounts, causing 21% IVA to be added on top.
```

Example `llms.txt`:
```
# Tax Correction
> Fix wrong tax-inclusive invoices via Invopop

## Status
- [status.md](status.md) — Current status and next steps
```

Example `status.md`:
```markdown
# Tax Correction — Status

**Created:** 2026-04-15

## Context
Fix wrong tax-inclusive invoices via Invopop

## Next Steps
-
```

The system doesn't parse or enforce `status.md` — it's a convention for the AI to read. `info.md` is the only required file (enforced by the existing module detail endpoint).

### 3. Backend Changes

#### 3.1 Manifest model

Add `kind` and `archived` fields as shown above.

**Note:** This spec's `kind` field supersedes the `type` field proposed in `docs/plans/active/20-module-types-and-support-workflow.md`. The earlier plan should be updated to reference `kind` instead of `type`. The name `kind` was chosen to avoid collision with Python's `type` builtin and Pydantic's `model_type` conventions.

#### 3.2 API response model (`platform/src/models.py`)

Add `kind` and `archived` to the module list response:

```python
class ModuleInfo(BaseModel):
    name: str
    kind: str = "integration"
    summary: str = ""
    archived: bool = False
```

#### 3.3 Module list endpoint (`GET /api/modules`)

Currently returns `{ modules: string[] }`. Change to return rich objects:

```json
{
  "modules": [
    { "name": "linear", "kind": "integration", "summary": "...", "archived": false },
    { "name": "tax-correction", "kind": "task", "summary": "...", "archived": false },
    { "name": "old-issue", "kind": "task", "summary": "...", "archived": true }
  ]
}
```

This is a breaking change to the response shape. Frontend must be updated in the same PR.

#### 3.4 Archive/unarchive endpoints

- `POST /api/modules/{name}/archive` — reads `module.yaml`, sets `archived: true`, writes back.
- `POST /api/modules/{name}/unarchive` — sets `archived: false`, writes back.

If the module is currently loaded when archived, it must be unloaded. Since there is no single-module unload endpoint (the current `POST /api/workspace/load` does a full clear-and-relink), the archive endpoint should: (1) read the current loaded module set from `context/`, (2) remove the archived module from that set, (3) call the existing full workspace load flow with the remaining modules. This ensures `.env.schema` regeneration, root `llms.txt` regeneration, and secrets cache stay consistent.

#### 3.5 File path validation

`validate_module_file_path` in `platform/src/services/schemas.py` currently only allows `info.md` and `docs/*.md`. Task modules use `status.md` at the root level. Update the validation to also allow `status.md`:

```python
if file_path in ("info.md", "status.md"):
    return file_path
```

This is the minimal change. If tasks accumulate other root-level files (scripts, CSVs), those will be accessible via the AI reading symlinked files directly but not through the file CRUD API — which is fine, since the file CRUD API is for the module editor UI and tasks don't need their CSVs to be editable through it.

#### 3.6 Create-task endpoint

`POST /api/modules/create-task` with body `{ name: string, description?: string }`:

Request model:
```python
class CreateTaskRequest(BaseModel):
    name: str
    description: str = ""
```

Steps:
1. Slugify the name for the folder: lowercase, replace spaces and underscores with hyphens, strip non-alphanumeric/hyphen characters, collapse multiple hyphens (e.g., "Tax Correction" -> `tax-correction`, "Stealth TicketBAI Errors" -> `stealth-ticketbai-errors`). Validate the result against `validate_module_name`.
2. Scaffold `module.yaml`, `info.md`, `llms.txt`, `status.md` in `modules-repo/`
3. Auto-load: read the current loaded module set from `context/`, append the new task, call the existing full workspace load flow. This ensures all side effects (`.env.schema`, root `llms.txt`) are handled.
4. Return the created module info

**Route ordering:** This endpoint must be registered before `/{name}` parameterized routes in the FastAPI router to avoid routing conflicts.

Reuses existing `write_manifest` logic. Validates name doesn't conflict with existing modules.

### 4. Sidebar UI — Two Zones

The Context tab splits into two sections:

#### Integrations zone (top)
- Compact rendering — pills or collapsed cards
- Shows loaded/unloaded state, secrets status, package info
- Load/unload works the same as today
- Rarely interacted with

#### Tasks zone (below)
- Larger cards showing: name, summary, last-modified timestamp
- Prominent load/unload toggle
- "New Task" button at the top
- Archive button on each card (small icon)
- Collapsible "Archived" section at the bottom, collapsed by default
  - Each archived task has an "unarchive" action
  - Expanding shows all archived tasks

#### Implementation approach
The sidebar currently lives in `platform/frontend/src/components/ContextPanel.tsx` with module rendering in `platform/frontend/src/components/sidebar/` (`ModuleList.tsx`, `ModuleCard.tsx`, `IdleModuleCard.tsx`). The two-zone split modifies `ContextPanel.tsx` to render modules in two groups (filtered by `kind`), and may need a new `TaskCard.tsx` component in the `sidebar/` directory for the tasks zone cards. The existing `ModuleCard.tsx` and `IdleModuleCard.tsx` continue to serve the integrations zone.

#### What the AI sees
Nothing changes. Loaded modules (integration or task) appear as symlinks in `context/`. The AI reads files from task modules the same way it reads files from integrations.

### 5. Quick-Create Flow

1. User clicks "New Task" in the tasks zone
2. Modal with:
   - **Name** (required) — displayed as-is, slugified for folder name
   - **Description** (optional) — becomes the summary and seeds `status.md`
3. Click "Create":
   - Backend scaffolds the folder
   - Module is auto-loaded into workspace
   - Task appears in the tasks zone, loaded

### 6. Archive Mechanism

**Archive:** Click archive icon on task card -> `POST /api/modules/{name}/archive` -> `archived: true` in `module.yaml` -> unloads if loaded -> task moves from active list to "Archived" section.

**Unarchive:** Expand "Archived" section -> click "unarchive" -> `POST /api/modules/{name}/unarchive` -> `archived: false` -> task reappears in tasks zone (unloaded — user chooses when to load).

Properties:
- Reversible (boolean flip, no folder moves)
- Archived modules stay in git repo, sync normally
- No data loss
- Works for any module, but UI only shows archive button on tasks

**Unloaded vs Archived distinction:**
- **Unloaded** = not in AI's context but visible in task list. For tasks you're actively working on but don't need loaded right now.
- **Archived** = out of task list entirely. For resolved or abandoned tasks. Reversible if they resurface.

### 7. Support Workflow Relationship

The support module from the existing plan (`docs/plans/active/20-module-types-and-support-workflow.md`) is unaffected:

- It has `kind: integration` (default) — sits in the integrations zone as a capability
- No secrets, no dependencies
- The `/support` command reads its files (playbook-index, playbooks, journal)
- When a support task needs its own working context, the user creates a **task** for it

The support workflow is the process. Tasks are the working folders. They're complementary, not the same thing.

### 8. What Changes Where

| File | Change |
|---|---|
| `platform/src/services/manifest.py` | Add `kind` and `archived` to `ModuleManifest`; update `write_manifest` with explicit `kind != "integration"` check |
| `platform/src/services/schemas.py` | Update `validate_module_file_path` to allow `status.md` |
| `platform/src/models.py` | Add `ModuleInfo` and `CreateTaskRequest` models |
| `platform/src/routes/modules.py` | Update `GET /api/modules` to return `ModuleInfo` objects; add archive/unarchive endpoints; add create-task endpoint (before `/{name}` routes) |
| `platform/frontend/src/api/modules.ts` | Update types and fetch functions for new response shape (`string[]` -> `ModuleInfo[]`) |
| `platform/frontend/src/components/ContextPanel.tsx` | Split module rendering into two zones by `kind` |
| `platform/frontend/src/components/sidebar/TaskCard.tsx` | New component for task cards in the tasks zone |
| `platform/frontend/src/components/sidebar/CreateTaskModal.tsx` | New component for quick-create flow |
| `platform/frontend/src/components/sidebar/ModuleList.tsx` | May need updates to accept filtered module lists per zone |

**Breaking change consumers** — the `GET /api/modules` response changes from `{ modules: string[] }` to `{ modules: ModuleInfo[] }`. All frontend consumers must be updated:

| Consumer | Location |
|---|---|
| `fetchModules()` / `refreshModules()` | `platform/frontend/src/api/modules.ts` |
| Module list in ContextPanel | `platform/frontend/src/components/ContextPanel.tsx` |
| Module dashboard | `platform/frontend/src/components/ModuleDashboard.tsx` |
| Chat (module list for mentions) | `platform/frontend/src/components/Chat.tsx` |
| Tool call humanizer | `platform/frontend/src/utils/humanizeToolCall.ts` |

### 9. What Stays The Same

- Workspace load/unload (symlinks)
- Git sync (push/pull)
- Secrets machinery (tasks don't declare secrets)
- Module file editor (works on any module — task `info.md` and `status.md` are editable; other task files like CSVs are accessible to the AI via symlinks but not through the editor API)
- Chat and slash commands
- CLAUDE.md and context directory structure
- All existing module.yaml files (new fields have backwards-compatible defaults)

### 10. Superseded Plans

This spec supersedes the `type` field from `docs/plans/active/20-module-types-and-support-workflow.md` Phase 1. That plan proposed `type: str = "integration"` on `ModuleManifest` — this spec uses `kind` instead and extends it with `archived`. Phase 2 of that plan (support workflow module) is unaffected and can proceed independently.
