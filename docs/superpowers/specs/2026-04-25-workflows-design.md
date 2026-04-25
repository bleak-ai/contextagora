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

`ModuleManifest` gains two optional string fields (the existing `kind` field is already typed as `str` defaulting to `"integration"`, so no type-system change there):

- `entry_step: str | None = None` — only meaningful when `kind == "workflow"`. The filename in `steps/` to load first (e.g. `"1-intake.md"`). Required for workflows; ignored otherwise.
- `parent_workflow: str | None = None` — only meaningful when `kind == "task"`. The workflow module name this run came from. `None` for standalone tasks.

`write_manifest` round-trips both new fields under their snake_case names, omitting them when `None` (mirrors how `summary`, `secrets`, etc. are omitted when empty).

`ModuleKind` enum gains a `WORKFLOW = "workflow"` member with:

- `auto_load = True` — workflows are always loaded into the workspace (parallel to how tasks are auto-loaded today).
- `label = "Workflow"`.
- `scaffold(...)` — **not implemented for workflows**. Workflows are authored manually on disk (no create-via-modal flow in v1). The `api_create_module` route validates `body.kind` via `ModuleKind(body.kind)` and currently calls `kind.scaffold(...)`; we make `scaffold` raise `NotImplementedError` for `WORKFLOW` and have `api_create_module` reject `kind == "workflow"` with a 400. A workflow is created by writing files into `modules-repo/` directly (via the editor or git push), then the existing module-list endpoints pick it up.

`read_manifest` does **not** validate cross-file constraints (it would force I/O on every read). The validator script (see "Validation" section below) handles `entry_step` existence checks at lint time; the route layer (`POST /api/workflows/{workflow}/runs`) checks `entry_step` resolves to a real file at run-creation time and returns 400 if not.

### Always-loaded mechanism

Workflows must be present in `context/` so the agent can `Read` their step files. The existing always-loaded mechanism is `_active_task_names()` in `platform/src/services/workspace.py`, which forces `kind: task` (non-archived) modules into `reload_workspace`'s loaded list regardless of client input.

We rename `_active_task_names()` to `_always_loaded_module_names()` and extend it to also yield `kind: workflow` modules (workflows have no archived state — every workflow is always loaded). Run tasks (which are `kind: task` with `parent_workflow` set) get loaded by the existing task branch of the same function. This is a single 3-line change inside `workspace.py` plus the rename; all callers in the same file get the rename.

### Run lifecycle

**Canonical seed message** — used both by the sidebar Start-run modal and by the auto-registered slash command. The two paths produce the same first user message in the chat session, differing only in whether `{title}` is pre-filled (modal) or left for the agent to ask conversationally (slash command):

```
Begin a new run of the {workflow_name} workflow.
{title_line}
Read steps/{entry_step} from the workflow folder and follow it exactly.
The step's prose will tell you to call POST /api/workflows/{workflow_name}/runs
with a one-line title to create the run task.
```

`{title_line}` is `Title: "<user-supplied text>"` when the user came in via the modal, or omitted entirely when the user typed the bare slash command.

**Lifecycle steps:**

1. User clicks **Start run** on a workflow card (modal collects free-text "what's this run about?") — or types `/<workflow-name>` in chat.
2. Frontend opens a new chat with the seed message above as the first user message. (Reuses the same chat-creation path the existing slash commands use; no new chat infrastructure.)
3. Agent reads `steps/<entry_step>`. That file's prose (authored by the workflow author) instructs it to:
   - Ask the user for any additional context still needed (e.g. ticket ID, gym name, beyond what the title carries)
   - Confirm the title (if provided) or ask for one (if not)
   - Call `POST /api/workflows/<workflow_name>/runs` with `{title: "<final title>"}` to create the run task
   - Then proceed with whatever step 1 actually does (parse the ticket, run the merge, etc.)
4. Backend's `start_run` creates `modules-repo/<workflow_name>-run-<slug>/` (flat directory at the modules-repo root, not nested) with:
   - `module.yaml` — `kind: task`, `parent_workflow: <workflow_name>`, summary derived from the title
   - `status.md` — checklist seeded with one item per step file in the workflow's `steps/` dir (in numeric prefix order). Variant files sharing a number prefix collapse to a single line (e.g. step 4 with `4a-price-setup.md` + `4b-price-match.md` → one item: `Step 4 — choose price-setup or price-match`).
   - `info.md` — title and creation date
   - Triggers `reload_workspace` so the new run task is symlinked into `context/` immediately (caught by the always-loaded mechanism above).
5. Agent walks the workflow per the step prose, ticking items in the run task's `status.md` and writing per-run artifacts (execution logs, generated scripts, CSVs) into the run task's folder.
6. Cross-run knowledge updates (e.g. support's phase 5 playbook updates) are writes into the workflow's own folder, e.g. `modules-repo/maat-support/playbooks/refund-subscription.md`. The agent has both folders loaded — the step prose dictates which one any given write targets.
7. When the run is finished, the user archives the run task using the existing archive action. The parent workflow is never archived.

**Title-to-slug conversion.** The slug for the run-task directory name is built deterministically:

- Take the user-supplied title (from the modal, or from the agent's chat with the user when entering via slash command).
- Pass it through the existing `slugify_task_name()` helper in `platform/src/services/manifest.py` (lower, hyphen-collapse, alphanumeric-only).
- Compose the final directory name as `<workflow_name>-run-<title_slug>`.
- Validate via the existing `validate_module_name()` helper in `platform/src/services/schemas.py`. The composed name is guaranteed to satisfy its `^[a-zA-Z0-9][a-zA-Z0-9_-]*$` regex by construction (workflow names already validate, `slugify_task_name` produces `[a-z0-9-]`, joined by `-`).
- On collision (slug already exists in the modules repo), append `-2`, `-3`, etc. until unique.

This means a "SUP-42 refund subscription for FightZone" title against the `maat-support` workflow becomes `modules-repo/maat-support-run-sup-42-refund-subscription-for-fightzone/`. **No `claude -p` subprocess call for slugification** — `slugify_task_name` is deterministic and synchronous, which sidesteps a subprocess in the request path. (The earlier mention of "summary-generation subprocess" was misplaced — that pattern is for module *summary* text, not slugification.)

**Run-task naming convention recap.** Run tasks live at `modules-repo/<workflow_name>-run-<slug>/` — flat, prefix-grouped under the workflow's name. This works with `git_repo.list_modules()` (which only knows top-level dirs) and lets `list_workflows()` cheaply count in-flight runs by listing modules whose `parent_workflow` matches and whose `archived` is false.

### New service (`platform/src/services/workflows.py`)

- `list_workflows() -> list[WorkflowSummary]` — scans `git_repo.list_modules()`, returns those with `kind == "workflow"`. Each entry includes `name`, `entry_step`, the step file list (read from the workflow's `steps/` dir), and the in-flight run count (count of task modules with matching `parent_workflow` and `archived == False`).
- `start_run(workflow_name: str, title: str) -> RunInfo` — composes the slug per the title-to-slug rules above, validates via `validate_module_name`, writes `module.yaml` / `status.md` / `info.md` into `modules-repo/<workflow_name>-run-<slug>/`, then triggers `reload_workspace` to pick the new task up via the always-loaded mechanism. Returns `{run_task_name, path}`. Raises a 400-mappable error if the workflow doesn't exist or its `entry_step` doesn't resolve to a real file.
- No `slugify_via_claude` helper. `slugify_task_name` from `manifest.py` is deterministic and sufficient.

### New routes (`platform/src/routes/workflows.py`)

- `GET /api/workflows` → `list_workflows()` output. Used by the frontend sidebar zone.
- `POST /api/workflows/{workflow}/runs` body `{title: str}` → `start_run(...)`. Returns the new run task's name + path. **This is what the workflow's `1-intake.md` instructs the agent to call.**

No DELETE endpoint. Removing a run = archiving the run task via the existing task endpoints. Removing a workflow = manually deleting it from the modules repo (intentional, no UI action).

### Slash command auto-registration (`platform/src/commands.py`)

`COMMANDS` becomes a function-call instead of a module-level constant: `def list_commands() -> list[CommandDef]` returns the existing static entries plus one auto-generated entry per `kind: workflow` module currently in the modules repo. The auto-generated entry uses the canonical seed message template defined in the Run lifecycle section, with `{title_line}` omitted (the slash-command path always asks the user for the title in chat).

`GET /api/commands` calls `list_commands()` on every request — recomputed live, no cache. This is cheap (one disk listing of `modules-repo/` + one manifest read per module — same cost the routes already pay elsewhere) and avoids any cache-invalidation logic tied to `reload_workspace`. The route at `platform/src/routes/commands.py` updates from `from src.commands import COMMANDS` to calling `list_commands()` per request. (Open question 1 from earlier resolved here — recompute-on-call wins.)

No per-workflow command file authoring — the workflow's own `<entry_step>` carries the conversation. A workflow's surface is exactly one folder.

### Validation (`platform/src/scripts/validate_modules.py`)

Two new positive checks for the new kind:

- For `kind: workflow`: `entry_step` is set, the workflow's `steps/` directory exists, the `entry_step` filename exists inside it.
- For `kind: task` with `parent_workflow`: the named workflow exists in the modules repo (warning, not error — orphaned runs are valid; the parent workflow may have been intentionally removed and the run task still belongs to its history).

**Relax integration-specific checks for workflows.** The validator's existing `info.md` section checks (Purpose, Auth & access, etc.) and the secrets/dependencies cross-checks are designed for integrations. For `kind: workflow` modules, skip those — workflow `info.md` is free-form prose explaining the workflow, not the integration template. The validator's per-kind dispatch already exists for `task` (which similarly skips integration checks); we add a `workflow` branch that runs only the structural checks above plus the universal ones (`module.yaml` parses, `info.md` exists, `llms.txt` exists).

**`info.md` and `llms.txt` for workflows.** Both are required (universal module check), authored by hand by the workflow author. `regenerate_module_llms_txt` is not extended to auto-list `steps/*.md` or `playbooks/*.md` in v1 — workflow authors maintain their `llms.txt` themselves. (Rationale: the existing helper handles a flat managed-file list; teaching it about subdir trees is out of scope for this spec.)

### Frontend changes

- **`platform/frontend/src/components/sidebar/WorkflowsGroup.tsx`** — new component, mirrors `WorkspaceGroup.tsx`. Renders the Workflows zone above Active Tasks. Collapsible cards per workflow: name, in-flight run count, expandable list of step files (read from the workflow's `steps/` dir) and in-flight runs (each clickable → opens that run task in the existing editor), "Start run" button, edit action (opens the existing `ModuleEditorModal`).
- **`platform/frontend/src/components/sidebar/StartRunModal.tsx`** — single free-text input "what's this run about?". On submit, the modal:
  1. Constructs the canonical seed message from the Run lifecycle section, with the user's text inserted into `{title_line}`.
  2. Calls the same client-side helper that the existing slash-command flow uses to create a chat session with a seeded first user message (the path that powers `/add-integration` etc. when the user invokes a command from the SlashCommandSelector).
  3. Closes the modal and lets the chat take over. The agent reads `<entry_step>`, calls `POST /api/workflows/.../runs` itself per the step's prose.

  The modal does **not** call `POST /api/workflows/.../runs`. All run-task creation is initiated from chat by the agent. This means the run task only comes into existence after the user has confirmed the title in conversation, which matches the option-(b) flow chosen in brainstorming.
- **Active Tasks zone (existing `WorkspaceGroup` / its tasks subzone)** — **no filtering change.** Run tasks (which are `kind: task` with `parent_workflow` set) appear in the Active Tasks zone exactly like standalone tasks, identified by the `[from <workflow>]` badge described next. They also appear nested under their parent workflow in the new Workflows zone — the same task module surfaces in both places.
- **Task card rendering** (`platform/frontend/src/components/sidebar/cards/TaskCard.tsx` or the equivalent file in the existing card layer — implementer should grep for the current task-card component) — extended to render a `[from <workflow>]` badge when the task module's manifest has `parent_workflow` set. The badge is a label + workflow name, click optionally scrolls/jumps to the workflow card. ~5–10 lines of conditional render.
- **`platform/frontend/src/api/workflows.ts`** — API client mirroring `jobs.ts` shape: `fetchWorkflows()`, types `Workflow` (name, entry_step, steps, runs) and `WorkflowRun` (run task name, title, archived). No `startRun` client method (per the modal flow above — the agent calls the backend route, not the frontend).
- **Existing `ModuleEditorModal`** — works unchanged. Workflow files are markdown in a module dir; the existing file editor handles them, including step files and free-form playbook files. (`.md` is already in the `validate_module_file_path` allow-list.)
- **`platform/frontend/src/components/ContextPanel.tsx`** (or wherever the right-sidebar zones are composed in the current code — implementer should locate the sidebar composition file) — mount `WorkflowsGroup` above the existing Active Tasks zone.

### llms.txt updates

After implementation, add entries under "Platform Backend" for the new files (`workflows.py` service, `workflows.py` routes, `workflows.ts` API client, `WorkflowsGroup.tsx`, `StartRunModal.tsx`).

## Open questions

None blocking implementation. One judgment call during build:

1. **Whether `WorkflowsGroup` and `WorkspaceGroup` share a common `<CollapsibleZone>` extraction.** Defer until both exist — refactor only if duplication is real, not preemptively.

(The earlier open question about *where* to refresh the dynamic command registry has been resolved in the "Slash command auto-registration" section: recompute on every `GET /api/commands` call, no `reload_workspace` hook.)
