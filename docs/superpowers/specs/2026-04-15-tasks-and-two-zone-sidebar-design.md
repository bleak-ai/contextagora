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

`write_manifest` omits `kind` when `"integration"` and `archived` when `false`, keeping existing `module.yaml` files untouched.

### 2. Task Module Structure

A task module is a regular module folder with a conventional file structure:

```
tax-correction/
├── module.yaml        # kind: task, summary
├── llms.txt           # index of contents (for AI navigation)
├── status.md          # current state and next steps
└── ...                # investigation notes, scripts, CSVs, drafts — whatever accumulates
```

Example `module.yaml`:
```yaml
name: tax-correction
kind: task
summary: "Fix wrong tax-inclusive invoices via Invopop"
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

The system doesn't parse or enforce these files. They're conventions for the AI to read.

### 3. Backend Changes

#### 3.1 Manifest model

Add `kind` and `archived` fields as shown above.

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

If the module is currently loaded when archived, it gets unloaded (symlink removed from `context/`).

#### 3.5 Create-task endpoint

`POST /api/modules/create-task` with body `{ name: string, description?: string }`:

1. Slugify the name for the folder (e.g., "Tax Correction" -> `tax-correction`)
2. Scaffold `module.yaml`, `llms.txt`, `status.md` in `modules-repo/`
3. Trigger workspace reload to symlink it into `context/`
4. Return the created module info

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
Integrate into the **zones layout** (`ZonesLayout.tsx`) first, which already has a top/bottom concept. Other layouts (classic, accordion, cards) can follow later.

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
| `platform/src/services/manifest.py` | Add `kind` and `archived` to `ModuleManifest`; update `write_manifest` to conditionally include them |
| `platform/src/models.py` | Add `ModuleInfo` model with `kind`, `summary`, `archived` |
| `platform/src/routes/modules.py` | Update `GET /api/modules` to return `ModuleInfo` objects; add archive/unarchive endpoints; add create-task endpoint |
| `platform/frontend/src/api/modules.ts` | Update types and fetch functions for new response shape |
| `platform/frontend/src/components/context/ZonesLayout.tsx` | Two-zone rendering (integrations + tasks) |
| `platform/frontend/src/components/context/TaskCard.tsx` | New component for task cards in the tasks zone |
| `platform/frontend/src/components/context/CreateTaskModal.tsx` | New component for quick-create flow |
| `platform/frontend/src/components/context/useContextData.ts` | Split module data by `kind` for zone rendering |

### 9. What Stays The Same

- Workspace load/unload (symlinks)
- Git sync (push/pull)
- Secrets machinery (tasks don't declare secrets)
- Module file editor (works on any module)
- Chat and slash commands
- CLAUDE.md and context directory structure
- All existing module.yaml files (new fields have backwards-compatible defaults)
