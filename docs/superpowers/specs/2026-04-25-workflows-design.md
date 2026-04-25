# Workflows — multi-step processes as a new module kind

## Problem

Three real workflows need to live inside Contextagora and they don't fit any existing primitive:

- **Coding workflow** — plan → tests → code → PR review (linear, agent-driven)
- **MAAT support workflow** — 6 phases per Linear SUP ticket, with HITL gates and a self-evolving playbook library (`/Users/bsampera/Documents/maat/maatagent/src/execute/support/workflow.md`)
- **Migration workflow** — 6 numbered steps per gym, with branching (`4a` price-setup vs `4b` price-match), per-gym workspace folders, and long-lived state across many sessions (`/Users/bsampera/Documents/maat/migration-agent/PROMPT.MD`)

Today the system has **integrations** (third-party services, never archived), **tasks** (per-goal trackers with `status.md`, archived when done), **slash commands** (one-shot multi-turn prompts), and **jobs** (cron scripts in `module.yaml`). None of these is the right home for a multi-step process whose steps cite playbooks, branch on conditions, sometimes loop back, and produce per-run artifacts that need to be findable later.

The shape we need is: a **template that lives in the modules repo and is never archived** (like an integration), where each invocation creates **a per-instance run with its own state and artifact folder** (like a task). The user explicitly wants this in its own sidebar zone.

## Goals

- One new module kind, `kind: workflow`, that lives in `modules-repo/` alongside integrations and tasks.
- A workflow is a folder of numbered markdown step files. Each step's "Next" prose dictates flow control (linear, branching, loop-back). No graph engine.
- Each run is a regular task (`kind: task`) tagged with `parent_workflow: <workflow_name>`. Reuses the existing task infrastructure (sidebar card, file CRUD, archive flow, secret loading, sync).
- A workflow can accumulate cross-run knowledge in its own folder (e.g. support's `playbooks/`); per-run artifacts (logs, CSVs, scripts) live in the run task's folder. The agent has both folders loaded — step prose decides where to write what.
- Two ways to start a run: a "Start run" button on the workflow's sidebar card, or an auto-registered `/<workflow-name>` slash command in chat. Both seed the same intake flow.
- New "Workflows" zone in the sidebar above Active Tasks. Workflows are never archived; runs follow the existing task archive flow.
- Workflow runs appear in **both** the Workflows zone (nested under their parent) and the Active Tasks zone (with a `[from <workflow>]` badge), since they are tasks.

## Non-goals

- A graph execution engine, declarative transition syntax, or shared-state schema across steps. Flow control lives in the step prose. We are not building langgraph.
- A separate runs DB or per-run state file. Run progress lives in the run task's `status.md` (a checklist) like any other task. The list of in-flight runs is computed by scanning task modules with `parent_workflow == X`.
- Per-step modes (`auto` / `manual`), gate flags, or YAML frontmatter on step files. The agent and the existing chat HITL flow (TRY markers, approval-before-write) handle pacing. Step files are pure markdown.
- An ON/OFF toggle on workflow cards. Workflows are always loaded when present — they are cheap (just files), and you almost always want to start a run from them.
- Migration of existing modules. Workflows are greenfield. The three example workflows above will be authored fresh into `modules-repo/`.
- Automated tests for the workflow execution end-to-end. Manual verification only. The backend additions get unit tests (manifest fields, scheduler-style scanning, slug generation, route smoke tests).
- Renaming `parent_workflow` later. We pick the field name once and keep it.

## Design

### On-disk structure

A workflow is a module dir under `modules-repo/`. Worked example using the support workflow:

```
modules-repo/maat-support/
├── module.yaml          # kind: workflow, entry_step: 1-intake.md
├── info.md              # what this workflow does
├── llms.txt             # nav (lists steps + playbooks)
├── steps/
│   ├── 1-intake.md
│   ├── 2-plan.md
│   ├── 3-execute.md
│   ├── 4-log.md
│   ├── 5-learn.md
│   └── 6-close.md
└── playbooks/           # optional, free-form knowledge base
    ├── llms.txt
    ├── refund-subscription.md
    └── update-gym-email.md
```

Migration workflow with variants (`4a` / `4b` share number 4):

```
modules-repo/migration/
├── module.yaml          # kind: workflow, entry_step: 1-merge.md
├── info.md
├── llms.txt
├── steps/
│   ├── 1-merge.md
│   ├── 2-transform.md
│   ├── 3-match.md
│   ├── 4a-price-setup.md
│   ├── 4b-price-match.md
│   ├── 5-batch.md
│   └── 6-upload.md
└── provider_info/       # cross-run knowledge, free-form
    ├── llms.txt
    ├── glofox.md
    └── gocardless.md
```

**Step files are pure markdown — no frontmatter.** The numeric prefix communicates canonical order; the prose at the bottom of each file communicates conditional flow.

Example tail of `2-plan.md`:

```markdown
## Next

- If user approves the plan → read `steps/3-execute.md` and continue.
- If user rejects or the ticket is invalid → read `steps/1-intake.md` again with the new info.
- If the ticket needs to be cancelled → read `steps/6-close.md`.
```

Variants are sibling files (`4a-price-setup.md`, `4b-price-match.md`); the prose at the end of step 3 instructs the agent to ask the user which variant to use, then read the right file.

### Manifest extension (`platform/src/services/manifest.py`)

`ModuleManifest` gains:

- `kind: Literal["integration", "task", "workflow"]` — the existing literal grows by one value.
- `entry_step: str | None` — only meaningful when `kind == "workflow"`. The filename in `steps/` to load first (e.g. `"1-intake.md"`). Required for workflows; ignored otherwise.
- `parent_workflow: str | None` — only meaningful when `kind == "task"`. The workflow module name this run came from. `None` for standalone tasks.

`write_manifest` round-trips both new fields. `read_manifest` validates that workflow modules have `entry_step` and that `entry_step` exists as a file in `steps/`.

### Run lifecycle

1. User clicks **Start run** on a workflow card in the sidebar — or types the auto-registered `/<workflow-name>` slash command in chat.
2. The frontend opens chat with a single seeded user message:
   `"Begin a new run of the maat-support workflow. Read steps/1-intake.md from the workflow folder and follow it exactly. The first thing it will tell you to do is gather context (e.g. ticket ID, gym name) and create the run task by calling POST /api/workflows/maat-support/runs with a one-line title."`
3. The agent reads `steps/1-intake.md`. That file's prose instructs it to:
   - Ask the user for the necessary context (Linear ticket ID, gym name, etc.)
   - Generate a one-line title from that context
   - Call `POST /api/workflows/maat-support/runs` with `{title}` to create the run task
   - Then proceed with whatever step 1 actually does (parse the ticket, etc.)
4. Backend creates `modules-repo/maat-support-runs/<slug>/` with:
   - `module.yaml` — `kind: task`, `parent_workflow: maat-support`, summary from the title
   - `status.md` — checklist seeded with the workflow's step IDs (one item per file in `steps/`, in numeric order). Variants share a single line ("Step 4 — choose price-setup or price-match").
   - `info.md` — title, creation date
   - Auto-loads via the existing `reload_workspace` flow so the agent immediately has the run task's folder symlinked into context.
5. Agent walks the workflow per the step prose, ticking items in the run task's `status.md` and writing per-run artifacts (execution log, generated scripts, CSVs) into the run task's folder.
6. Cross-run knowledge updates (e.g. support's phase 5 playbook updates) are writes into the workflow's own folder, e.g. `modules-repo/maat-support/playbooks/refund-subscription.md`. The agent has both folders loaded — the step prose dictates which one a given write targets.
7. When the run is finished, the user archives the run task using the existing archive action. The parent workflow itself is never archived.

**Title generation.** The user-supplied input from step 3 is a free-form natural-language description (e.g. "SUP-42 refund subscription for FightZone"). The backend slugifies it via the existing summary-generation subprocess pattern (`claude -p` quick call) into a kebab-case directory name (`sup-42-refund-fightzone`). The agent surfaces the generated slug to the user in chat for visibility but does not block on confirmation — the user can rename later via the editor if needed.

**Run-task naming convention.** Run tasks live under `modules-repo/<workflow-name>-runs/<slug>/`. This keeps them grouped on disk and lets `list_workflows` cheaply count in-flight runs (count of `kind: task` modules with `parent_workflow == X`).

### New service (`platform/src/services/workflows.py`)

- `list_workflows() -> list[WorkflowSummary]` — scans loaded modules, returns workflows with their `entry_step`, step file list (read from `steps/` dir), and in-flight run count (count of task modules with matching `parent_workflow`).
- `start_run(workflow_name: str, title: str) -> RunInfo` — generates slug from title, creates the run task module on disk (manifest + status.md + info.md), triggers `reload_workspace` to symlink it into context, returns `{run_task_name, slug, path}`. Idempotent on slug collision via `-2`, `-3` suffixes.
- `slugify_via_claude(title: str) -> str` — wraps the existing summary-generation subprocess pattern from the editor (the same code path that powers `summary` autogen on module create). Returns kebab-case.

### New routes (`platform/src/routes/workflows.py`)

- `GET /api/workflows` → `list_workflows()` output. Used by the frontend sidebar zone.
- `POST /api/workflows/{workflow}/runs` body `{title: str}` → `start_run(...)`. Returns the new run task's name + path. **This is what the workflow's `1-intake.md` instructs the agent to call.**

No DELETE endpoint. Removing a run = archiving the run task via the existing task endpoints. Removing a workflow = manually deleting it from the modules repo (intentional, no UI action).

### Slash command auto-registration (`platform/src/commands.py`)

`COMMANDS` becomes a dynamic registry: existing static entries plus one auto-generated entry per `kind: workflow` module currently loaded.

The auto-generated entry has a fixed prompt template:

```
Begin a new run of the {workflow_name} workflow.
Read steps/{entry_step} from the workflow folder and follow it exactly.
The step's prose will tell you to gather context, then call
POST /api/workflows/{workflow_name}/runs with a one-line title to create the run task.
```

No per-workflow command file authoring — the workflow's own `1-intake.md` carries the conversation. This keeps a workflow's surface to one folder.

The dynamic registry refreshes whenever the workspace is reloaded (i.e. on module add/remove/load/unload). The existing `GET /api/commands` route returns the union.

### Validation (`platform/src/scripts/validate_modules.py`)

Two new checks:

- For `kind: workflow`: `entry_step` is set, `steps/` directory exists, `entry_step` filename exists inside `steps/`.
- For `kind: task` with `parent_workflow`: the named workflow exists in the modules repo (warning, not error — orphaned runs are valid; the workflow may have been intentionally removed).

### Frontend changes

- **`platform/frontend/src/components/sidebar/WorkflowsGroup.tsx`** — new component, mirrors `WorkspaceGroup.tsx`. Renders the Workflows zone above Active Tasks. Collapsible cards: name, in-flight run count, expandable list of step files (read from the workflow's `steps/` dir) and in-flight runs, "Start run" button, edit action (opens the existing `ModuleEditorModal`).
- **`platform/frontend/src/components/sidebar/StartRunModal.tsx`** — free-text input "what's this run about?". On submit, opens a chat with the auto-registered slash command pre-typed (or seeds the message via the existing chat path that powers slash commands). The actual run-task creation happens inside chat via `1-intake.md` calling the backend route — the modal does not call `POST /api/workflows/.../runs` itself.
- **`platform/frontend/src/components/sidebar/ModuleCard.tsx`** — extended to render a `[from <workflow>]` badge when the task module's manifest has `parent_workflow` set. ~5 lines of conditional render.
- **`platform/frontend/src/api/workflows.ts`** — API client mirroring `jobs.ts` shape: `fetchWorkflows()`, `startRun(workflow, title)`. Types: `Workflow`, `WorkflowRun`.
- **Existing `ModuleEditorModal`** — works unchanged. Workflow files are markdown in a module dir; the existing file editor handles them.
- **`platform/frontend/src/components/ContextPanel.tsx`** (or wherever the right-sidebar zones are composed) — mount `WorkflowsGroup` above the existing tasks zone.

### llms.txt updates

After implementation, add entries under "Platform Backend" for the new files (`workflows.py` service, `workflows.py` routes, `workflows.ts` API client, `WorkflowsGroup.tsx`, `StartRunModal.tsx`).

## Open questions

None blocking implementation. Two judgment calls during build:

1. **Where does the dynamic command registry refresh hook in?** Either inside `reload_workspace` (cleaner — same trigger as workspace changes) or recomputed on every `GET /api/commands` call (simpler — no cache invalidation logic). Lean toward the latter for v1; the call is cheap.
2. **Whether `WorkflowsGroup` and `WorkspaceGroup` share a common `<CollapsibleZone>` extraction.** Defer until both exist — refactor only if duplication is real, not preemptively.
