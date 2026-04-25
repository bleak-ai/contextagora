# Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third module kind, `workflow`, that lives in `modules-repo/` alongside `integration` and `task`. A workflow is a folder of numbered markdown step files; each invocation creates a regular `kind: task` module tagged with `parent_workflow` to track per-run state and artifacts.

**Architecture:** Greenfield. Reuses the existing module/task/symlink/sync infrastructure. No graph engine — flow control lives in step prose ("Next" sections at the bottom of each step file). Backend extensions: two optional fields on `ModuleManifest`, one new enum member, one renamed always-loaded helper, one new service, one new router, a small refactor of the slash-command registry, and a per-kind dispatch in the validator. Frontend: one new sidebar zone, one modal, one badge on task cards.

**Tech Stack:** Python 3 + FastAPI + Pydantic (existing). React + TanStack Query (existing). Tests: pytest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-25-workflows-design.md`. The spec is authoritative — when in doubt, defer to it.

---

## Conventions for the implementing engineer

- Run all backend tests with `cd platform && uv run pytest <path>`. Never `python -m pytest` and never raw `pytest`.
- Run a single test: `cd platform && uv run pytest tests/test_manifest.py::test_name -v`.
- Frontend changes get manual verification (no automated FE tests). Verify by running the dev server and exercising the feature in a browser.
- `slugify_task_name` already exists in `platform/src/services/manifest.py` — reuse it everywhere a slug is needed. Do not write a new slug helper.
- `validate_module_name` already exists in `platform/src/services/schemas.py` — reuse it for any new module name validation.
- After each task: commit with a small, focused message. Frequent commits make rollback easy.
- Do not modify the spec file. If a task can't be completed as written, raise it back to the user — don't drift.

---

## File Structure

**Create:**
- `platform/src/services/workflows.py` — `list_workflows`, `start_run`, `WorkflowSummary`, `RunInfo`
- `platform/src/routes/workflows.py` — `GET /api/workflows`, `POST /api/workflows/{workflow}/runs`
- `platform/tests/test_workflows_service.py` — service unit tests with tmp_path-backed modules repo
- `platform/tests/test_workflows_routes.py` — route smoke tests
- `platform/frontend/src/api/workflows.ts` — `fetchWorkflows`, types `Workflow`, `WorkflowRun`
- `platform/frontend/src/components/sidebar/WorkflowsGroup.tsx`
- `platform/frontend/src/components/sidebar/StartRunModal.tsx`

**Modify:**
- `platform/src/services/manifest.py` — add `entry_step` + `parent_workflow` fields, add `WORKFLOW` enum member with `scaffold` raising `NotImplementedError`
- `platform/src/services/workspace.py` — rename `_active_task_names` → `_always_loaded_module_names`, extend to include workflows
- `platform/src/routes/modules.py` — reject `kind == "workflow"` in `api_create_module`; include `parent_workflow` in `ModuleInfo` response
- `platform/src/models.py` — add `parent_workflow: str | None = None` to `ModuleInfo`
- `platform/src/commands.py` — turn `COMMANDS` into a `list_commands()` function that includes auto-registered workflow entries
- `platform/src/routes/commands.py` — call `list_commands()` per request
- `platform/src/server.py` — mount the workflows router
- `platform/src/scripts/validate_modules.py` — introduce per-kind dispatch with an `integration` branch (existing checks), a `workflow` branch (new structural checks), and a `task` branch (universal-only). Add a `parent_workflow` cross-check on tasks.
- `platform/tests/test_manifest.py` — round-trip new fields, `WORKFLOW` enum
- `platform/tests/test_workspace_inspect.py` — workflows are in the always-loaded list
- `platform/tests/test_create_module.py` — workflow create is rejected
- `platform/tests/test_commands.py` — workflow auto-registers a command
- `platform/frontend/src/api/modules.ts` — add `parent_workflow` to `ModuleInfo` type
- `platform/frontend/src/components/sidebar/cards/TaskCard.tsx` — render `[from <workflow>]` badge
- `platform/frontend/src/components/ContextPanel.tsx` — mount `WorkflowsGroup` above `WorkspaceGroup`'s tasks zone
- `llms.txt` — link the new files

---

## Task 1: Add `entry_step` + `parent_workflow` to `ModuleManifest`

**Files:**
- Modify: `platform/src/services/manifest.py`
- Test: `platform/tests/test_manifest.py`

Two optional string fields on the existing model. `write_manifest` round-trips them, omitting `None`.

- [ ] **Step 1: Write failing tests**

Append to `platform/tests/test_manifest.py`:

```python
def test_manifest_workflow_fields_roundtrip(tmp_path):
    raw = yaml.dump({
        "name": "maat-support",
        "kind": "workflow",
        "entry_step": "1-intake.md",
    })
    (tmp_path / "module.yaml").write_text(raw)
    m = read_manifest(tmp_path)
    assert m.kind == "workflow"
    assert m.entry_step == "1-intake.md"
    assert m.parent_workflow is None


def test_manifest_parent_workflow_roundtrip(tmp_path):
    raw = yaml.dump({
        "name": "maat-support-run-sup-42",
        "kind": "task",
        "parent_workflow": "maat-support",
    })
    (tmp_path / "module.yaml").write_text(raw)
    m = read_manifest(tmp_path)
    assert m.parent_workflow == "maat-support"


def test_write_manifest_omits_none_workflow_fields(tmp_path):
    m = ModuleManifest(name="foo")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert "entry_step" not in raw
    assert "parent_workflow" not in raw


def test_write_manifest_includes_entry_step(tmp_path):
    m = ModuleManifest(name="foo", kind="workflow", entry_step="1-intake.md")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["kind"] == "workflow"
    assert raw["entry_step"] == "1-intake.md"


def test_write_manifest_includes_parent_workflow(tmp_path):
    m = ModuleManifest(name="run-x", kind="task", parent_workflow="migration")
    write_manifest(tmp_path, m)
    raw = yaml.safe_load((tmp_path / "module.yaml").read_text())
    assert raw["parent_workflow"] == "migration"
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd platform && uv run pytest tests/test_manifest.py -v -k "workflow_fields or parent_workflow or omits_none_workflow or includes_entry_step or includes_parent_workflow"
```
Expected: failures (`AttributeError` or pydantic `Extra inputs not permitted` depending on model config).

- [ ] **Step 3: Add the fields**

In `platform/src/services/manifest.py`, modify `ModuleManifest`:

```python
class ModuleManifest(BaseModel):
    name: str
    kind: str = "integration"   # "integration" | "task" | "workflow"
    summary: str = ""
    secrets: list[str] = []
    dependencies: list[str] = []
    archived: bool = False
    jobs: list[JobSpec] = []
    entry_step: str | None = None       # workflow only — filename in steps/
    parent_workflow: str | None = None  # task only — workflow this run came from
```

Modify `write_manifest` to round-trip both, after the existing `archived` block:

```python
    if manifest.entry_step is not None:
        data["entry_step"] = manifest.entry_step
    if manifest.parent_workflow is not None:
        data["parent_workflow"] = manifest.parent_workflow
```

(Place these *before* the `jobs` block so the field order in YAML files mirrors the precedence: identity → status → workflow links → jobs.)

- [ ] **Step 4: Run tests, verify pass**

```bash
cd platform && uv run pytest tests/test_manifest.py -v
```
Expected: all green (existing tests stay green; new ones pass).

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/manifest.py platform/tests/test_manifest.py
git commit -m "feat(workflows): add entry_step + parent_workflow manifest fields"
```

---

## Task 2: Add `WORKFLOW` to `ModuleKind` enum

**Files:**
- Modify: `platform/src/services/manifest.py`
- Test: `platform/tests/test_manifest.py`

`WORKFLOW` joins the enum. `auto_load = True` (workflows are always loaded). `scaffold` raises `NotImplementedError` — workflows are authored on disk, not via the create-module modal.

- [ ] **Step 1: Write failing tests**

Append to `platform/tests/test_manifest.py`:

```python
def test_module_kind_workflow_exists():
    from src.services.manifest import ModuleKind
    assert ModuleKind("workflow") is ModuleKind.WORKFLOW
    assert ModuleKind.WORKFLOW.value == "workflow"


def test_module_kind_workflow_auto_loads():
    from src.services.manifest import ModuleKind
    assert ModuleKind.WORKFLOW.auto_load is True


def test_module_kind_workflow_label():
    from src.services.manifest import ModuleKind
    assert ModuleKind.WORKFLOW.label == "Workflow"


def test_module_kind_workflow_scaffold_raises():
    from src.services.manifest import ModuleKind
    from src.models import CreateModuleRequest
    body = CreateModuleRequest(name="x", kind="workflow", content="")
    with pytest.raises(NotImplementedError):
        ModuleKind.WORKFLOW.scaffold("x", body)
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd platform && uv run pytest tests/test_manifest.py -v -k "module_kind_workflow"
```
Expected: failures (`ValueError: 'workflow' is not a valid ModuleKind`).

- [ ] **Step 3: Implement**

In `platform/src/services/manifest.py`, modify `ModuleKind`:

```python
class ModuleKind(str, Enum):
    INTEGRATION = "integration"
    TASK = "task"
    WORKFLOW = "workflow"

    @property
    def auto_load(self) -> bool:
        # Tasks and workflows are always present in the workspace.
        return self is ModuleKind.TASK or self is ModuleKind.WORKFLOW

    @property
    def label(self) -> str:
        return self.value.capitalize()

    def scaffold(self, slug: str, body: CreateModuleRequest) -> None:
        if self is ModuleKind.INTEGRATION:
            _scaffold_integration(slug, body)
        elif self is ModuleKind.TASK:
            _scaffold_task(slug, body)
        else:
            # Workflows are authored manually on disk — there is no
            # opinionated scaffold for them in v1.
            raise NotImplementedError(
                "Workflow modules must be authored on disk, not created via the modal"
            )
```

Update the docstring on `ModuleKind` to mention `WORKFLOW`.

- [ ] **Step 4: Run tests, verify pass**

```bash
cd platform && uv run pytest tests/test_manifest.py -v
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add platform/src/services/manifest.py platform/tests/test_manifest.py
git commit -m "feat(workflows): add WORKFLOW member to ModuleKind enum"
```

---

## Task 3: Reject `kind: workflow` in `api_create_module`

**Files:**
- Modify: `platform/src/routes/modules.py`
- Test: `platform/tests/test_create_module.py`

The route currently calls `kind.scaffold(...)`, which now raises `NotImplementedError` for workflows. Convert that into a clean 400 response *before* attempting any disk writes — otherwise we'd create a module dir then fail mid-flight.

- [ ] **Step 1: Read the existing test file to learn its conventions**

```bash
cd platform && cat tests/test_create_module.py | head -80
```
(For pattern reference — TestClient setup, fixture conventions.)

- [ ] **Step 2: Write the failing test**

Append to `platform/tests/test_create_module.py`:

```python
def test_create_module_rejects_workflow_kind(client):
    """Workflows must be authored on disk, not via the modal."""
    resp = client.post("/api/modules", json={
        "name": "my-workflow",
        "kind": "workflow",
        "content": "",
    })
    assert resp.status_code == 400
    assert "workflow" in resp.json()["error"].lower()
```

(`client` is the TestClient fixture used by the other tests in this file. If the file uses a different fixture name, match that.)

- [ ] **Step 3: Run it, verify failure**

```bash
cd platform && uv run pytest tests/test_create_module.py::test_create_module_rejects_workflow_kind -v
```
Expected: failure (likely 500 from the unhandled `NotImplementedError`, or 201 if scaffold somehow no-ops).

- [ ] **Step 4: Implement the rejection**

In `platform/src/routes/modules.py`, modify `api_create_module`. After the `kind = ModuleKind(body.kind)` line and before `slug = ...`, add:

```python
    if kind is ModuleKind.WORKFLOW:
        return JSONResponse(
            {"error": "Workflow modules must be authored on disk; they cannot be created via this endpoint."},
            status_code=400,
        )
```

- [ ] **Step 5: Run the test, verify pass**

```bash
cd platform && uv run pytest tests/test_create_module.py -v
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add platform/src/routes/modules.py platform/tests/test_create_module.py
git commit -m "feat(workflows): reject kind=workflow in /api/modules POST"
```

---

## Task 4: Rename `_active_task_names` → `_always_loaded_module_names`, include workflows

**Files:**
- Modify: `platform/src/services/workspace.py`
- Test: `platform/tests/test_workspace_inspect.py`

The function currently yields non-archived `kind: task` modules; `reload_workspace` merges this into the loaded list to enforce the always-loaded invariant. Extend it to also yield `kind: workflow` modules (workflows have no archived state — every workflow is always loaded). Rename so the new behavior matches the name.

- [ ] **Step 1: Read the existing test for context**

```bash
cd platform && cat tests/test_workspace_inspect.py | head -60
```
Note the fixture pattern (likely `tmp_path` plus a settings override or monkeypatch).

- [ ] **Step 2: Write failing tests**

Append to `platform/tests/test_workspace_inspect.py`:

```python
def test_always_loaded_module_names_includes_active_tasks(tmp_path, monkeypatch):
    """Renamed function preserves the existing task invariant."""
    from src.services import git_repo, workspace
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    # Create one active task, one archived task
    (tmp_path / "task-active").mkdir()
    (tmp_path / "task-active" / "module.yaml").write_text(
        "name: task-active\nkind: task\n"
    )
    (tmp_path / "task-done").mkdir()
    (tmp_path / "task-done" / "module.yaml").write_text(
        "name: task-done\nkind: task\narchived: true\n"
    )
    names = workspace._always_loaded_module_names()
    assert "task-active" in names
    assert "task-done" not in names


def test_always_loaded_module_names_includes_workflows(tmp_path, monkeypatch):
    """Workflows are always loaded — no archived check applies."""
    from src.services import git_repo, workspace
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "maat-support").mkdir()
    (tmp_path / "maat-support" / "module.yaml").write_text(
        "name: maat-support\nkind: workflow\nentry_step: 1-intake.md\n"
    )
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    names = workspace._always_loaded_module_names()
    assert "maat-support" in names
    assert "linear" not in names  # integrations are NOT always-loaded
```

(If `git_repo.MODULES_REPO_DIR` isn't directly monkeypatchable — check the actual symbol — use `monkeypatch.setattr(git_repo, "list_modules", lambda: ["task-active", "task-done", "maat-support", "linear"])` plus a `module_dir` patch. The exact mechanism depends on `git_repo`'s shape; copy whichever pattern other workspace tests use.)

- [ ] **Step 3: Run them, verify failure**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v -k "always_loaded"
```
Expected: failure (function doesn't exist by that name).

- [ ] **Step 4: Rename + extend in `workspace.py`**

Rename `_active_task_names` → `_always_loaded_module_names` and extend its body. The new function:

```python
def _always_loaded_module_names() -> list[str]:
    """Return names of all modules the server forces into the workspace.

    Tasks: loaded iff `archived=False`. Workflows: always loaded (no
    archived state). This invariant is owned by the server so that
    incomplete client-supplied module lists cannot silently orphan
    active tasks or hide workflows from the agent.
    """
    out: list[str] = []
    for name in git_repo.list_modules():
        try:
            manifest = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if manifest.kind == "task" and not manifest.archived:
            out.append(name)
        elif manifest.kind == "workflow":
            out.append(name)
    return out
```

Update the only caller inside `workspace.py` (in `reload_workspace`, currently `_active_task_names()` on line ~74). Grep for any other callers in the file and rename them too.

- [ ] **Step 5: Run all workspace tests**

```bash
cd platform && uv run pytest tests/test_workspace_inspect.py -v
```
Expected: all green.

- [ ] **Step 6: Search for other references that might break**

```bash
cd platform && grep -rn "_active_task_names" src/ tests/
```
Expected: no matches (function is `_`-prefixed so external use should be nil — confirm).

- [ ] **Step 7: Commit**

```bash
git add platform/src/services/workspace.py platform/tests/test_workspace_inspect.py
git commit -m "refactor(workspace): rename _active_task_names, include workflows"
```

---

## Task 5: Add `parent_workflow` to the `ModuleInfo` API response

**Files:**
- Modify: `platform/src/models.py`
- Modify: `platform/src/routes/modules.py`
- Modify: `platform/frontend/src/api/modules.ts`
- Test: extend an existing test in `platform/tests/test_register.py` or a similar route test that exercises `GET /api/modules`.

The frontend needs `parent_workflow` to render the `[from <workflow>]` badge on task cards. Thread it through the response model and the API client type.

- [ ] **Step 1: Find an existing list-modules test to extend**

```bash
cd platform && grep -rn "/api/modules" tests/ | grep -v "files/" | head
```
Pick one (likely in `test_create_module.py` or `test_register.py`).

- [ ] **Step 2: Write the failing assertion**

Add a new test that creates a task module with `parent_workflow` set in its `module.yaml` and asserts the field appears in the `GET /api/modules` response:

```python
def test_list_modules_returns_parent_workflow(tmp_path, monkeypatch, client):
    """Task modules created from a workflow expose parent_workflow."""
    from src.services import git_repo
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "maat-support-run-sup-42").mkdir()
    (tmp_path / "maat-support-run-sup-42" / "module.yaml").write_text(
        "name: maat-support-run-sup-42\nkind: task\nparent_workflow: maat-support\n"
    )
    resp = client.get("/api/modules")
    assert resp.status_code == 200
    runs = [m for m in resp.json()["modules"] if m["name"] == "maat-support-run-sup-42"]
    assert len(runs) == 1
    assert runs[0]["parent_workflow"] == "maat-support"
```

(Match the fixture pattern of the file you're editing.)

- [ ] **Step 3: Run it, verify failure**

Expected: KeyError or `parent_workflow` missing from the response.

- [ ] **Step 4: Add the field to `ModuleInfo`**

In `platform/src/models.py`, find the `ModuleInfo` Pydantic model and add:

```python
    parent_workflow: str | None = None
```

In `platform/src/routes/modules.py` `api_list_modules`, populate it:

```python
        modules.append(ModuleInfo(
            name=name,
            kind=manifest.kind,
            summary=manifest.summary,
            archived=manifest.archived,
            parent_workflow=manifest.parent_workflow,
        ))
```

In `platform/frontend/src/api/modules.ts`, find the `ModuleInfo` type (or equivalent name) and add:

```typescript
  parent_workflow: string | null;
```

- [ ] **Step 5: Run the test, verify pass**

```bash
cd platform && uv run pytest tests/<file> -v
```

- [ ] **Step 6: Commit**

```bash
git add platform/src/models.py platform/src/routes/modules.py platform/frontend/src/api/modules.ts platform/tests/<file>
git commit -m "feat(workflows): expose parent_workflow on ModuleInfo"
```

---

## Task 6: Build `services/workflows.py`

**Files:**
- Create: `platform/src/services/workflows.py`
- Create: `platform/tests/test_workflows_service.py`

Two public functions: `list_workflows()` and `start_run(workflow_name, title)`. Plus dataclass-style return types. Keep the service pure (logic + I/O), no FastAPI imports.

- [ ] **Step 1: Sketch the public surface**

Read the spec sections "New service" and "Run lifecycle" again to lock in the contract. The service must:

- Read manifests via the existing `read_manifest` helper.
- Build run-task slugs via `slugify_task_name(title)`, then compose `<workflow_name>-run-<slug>`.
- Validate the composed name via `validate_module_name`.
- On slug collision, append `-2`, `-3`, etc.
- Trigger `reload_workspace` after creating the run task so it's symlinked into `context/`.
- Raise a typed exception (define `WorkflowNotFound`, `WorkflowEntryStepMissing` at module top) the route layer maps to 404/400.

- [ ] **Step 2: Write failing tests**

Create `platform/tests/test_workflows_service.py`:

```python
from pathlib import Path

import pytest
import yaml


def _make_workflow(repo: Path, name: str, entry_step: str = "1-intake.md", steps: list[str] | None = None):
    """Helper: scaffold a workflow module under repo."""
    wdir = repo / name
    wdir.mkdir()
    (wdir / "module.yaml").write_text(
        yaml.dump({"name": name, "kind": "workflow", "entry_step": entry_step})
    )
    (wdir / "info.md").write_text(f"# {name}\n")
    (wdir / "llms.txt").write_text(f"# {name}\n> wf\n- [info.md](info.md)\n")
    sdir = wdir / "steps"
    sdir.mkdir()
    for s in (steps or [entry_step]):
        (sdir / s).write_text(f"# {s}\n")


def test_list_workflows_empty(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    assert workflows.list_workflows() == []


def test_list_workflows_returns_workflows_only(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    _make_workflow(tmp_path, "maat-support", steps=["1-intake.md", "2-plan.md"])
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    out = workflows.list_workflows()
    assert len(out) == 1
    assert out[0].name == "maat-support"
    assert out[0].entry_step == "1-intake.md"
    assert out[0].steps == ["1-intake.md", "2-plan.md"]
    assert out[0].in_flight_runs == 0


def test_list_workflows_counts_in_flight_runs(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    _make_workflow(tmp_path, "maat-support")
    # In-flight run
    (tmp_path / "maat-support-run-sup-42").mkdir()
    (tmp_path / "maat-support-run-sup-42" / "module.yaml").write_text(
        "name: maat-support-run-sup-42\nkind: task\nparent_workflow: maat-support\n"
    )
    # Archived run (excluded)
    (tmp_path / "maat-support-run-sup-1").mkdir()
    (tmp_path / "maat-support-run-sup-1" / "module.yaml").write_text(
        "name: maat-support-run-sup-1\nkind: task\nparent_workflow: maat-support\narchived: true\n"
    )
    out = workflows.list_workflows()
    assert out[0].in_flight_runs == 1


def test_start_run_creates_task_module(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    # Stub reload_workspace so tests don't touch CONTEXT_DIR
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(tmp_path, "maat-support", steps=["1-intake.md", "2-plan.md"])

    info = workflows.start_run("maat-support", "SUP-42 refund subscription")
    assert info.run_task_name == "maat-support-run-sup-42-refund-subscription"
    run_dir = tmp_path / info.run_task_name
    assert run_dir.is_dir()

    manifest = yaml.safe_load((run_dir / "module.yaml").read_text())
    assert manifest["name"] == info.run_task_name
    assert manifest["kind"] == "task"
    assert manifest["parent_workflow"] == "maat-support"

    status = (run_dir / "status.md").read_text()
    assert "1-intake.md" in status or "intake" in status
    assert "2-plan.md" in status or "plan" in status

    info_md = (run_dir / "info.md").read_text()
    assert "SUP-42 refund subscription" in info_md


def test_start_run_collapses_variants_in_status(tmp_path, monkeypatch):
    """Step files with shared numeric prefix collapse to one checklist line."""
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(
        tmp_path, "migration",
        entry_step="1-merge.md",
        steps=["1-merge.md", "2-transform.md", "4a-price-setup.md", "4b-price-match.md"],
    )
    info = workflows.start_run("migration", "acme-gym")
    status = (tmp_path / info.run_task_name / "status.md").read_text()
    # Step 4 collapses; both variant filenames should NOT appear as separate lines
    lines_with_4 = [ln for ln in status.splitlines() if ln.strip().startswith("- [ ]") and ("4" in ln)]
    assert len(lines_with_4) == 1


def test_start_run_collision_appends_suffix(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    _make_workflow(tmp_path, "wf")
    info1 = workflows.start_run("wf", "X")
    info2 = workflows.start_run("wf", "X")
    assert info1.run_task_name == "wf-run-x"
    assert info2.run_task_name == "wf-run-x-2"


def test_start_run_unknown_workflow_raises(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    with pytest.raises(workflows.WorkflowNotFound):
        workflows.start_run("nope", "x")


def test_start_run_missing_entry_step_raises(tmp_path, monkeypatch):
    from src.services import git_repo, workflows
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    monkeypatch.setattr(workflows, "reload_workspace", lambda names: None)
    # Workflow declares entry_step but the file doesn't exist
    wdir = tmp_path / "wf"
    wdir.mkdir()
    (wdir / "module.yaml").write_text("name: wf\nkind: workflow\nentry_step: 1-missing.md\n")
    (wdir / "info.md").write_text("# wf\n")
    (wdir / "steps").mkdir()
    with pytest.raises(workflows.WorkflowEntryStepMissing):
        workflows.start_run("wf", "x")
```

If `git_repo.MODULES_REPO_DIR` is read off `settings.MODULES_REPO_DIR` rather than `git_repo.MODULES_REPO_DIR`, monkeypatch `settings` instead. Inspect `git_repo.list_modules`/`git_repo.module_dir` to confirm what to patch — copy the pattern from `tests/test_workspace_inspect.py`.

- [ ] **Step 3: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_workflows_service.py -v
```
Expected: `ModuleNotFoundError: No module named 'src.services.workflows'`.

- [ ] **Step 4: Implement `services/workflows.py`**

Create `platform/src/services/workflows.py`:

```python
"""Workflow listing and run-creation service.

A workflow is a `kind: workflow` module under modules-repo/. Each run is
a `kind: task` module with `parent_workflow` set, written as a sibling
directory at `modules-repo/<workflow>-run-<slug>/`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.services import git_repo
from src.services.manifest import (
    ModuleManifest,
    read_manifest,
    slugify_task_name,
    write_manifest,
)
from src.services.schemas import validate_module_name
from src.services.workspace import get_loaded_module_names, reload_workspace


# Errors

class WorkflowError(Exception):
    """Base error for workflow operations."""


class WorkflowNotFound(WorkflowError):
    """The requested workflow doesn't exist in modules-repo."""


class WorkflowEntryStepMissing(WorkflowError):
    """The workflow's entry_step file doesn't exist on disk."""


# Return shapes

@dataclass(frozen=True)
class WorkflowSummary:
    name: str
    summary: str
    entry_step: str | None
    steps: list[str]          # filenames in steps/, sorted by numeric prefix
    in_flight_runs: int


@dataclass(frozen=True)
class RunInfo:
    run_task_name: str
    path: Path


# Helpers

_NUMERIC_PREFIX_RE = re.compile(r"^(\d+)([a-z]?)[-_](.+)$")


def _step_files(workflow_dir: Path) -> list[str]:
    """Return step filenames sorted by numeric prefix, then variant letter."""
    sdir = workflow_dir / "steps"
    if not sdir.is_dir():
        return []
    files = [p.name for p in sdir.iterdir() if p.is_file() and p.suffix == ".md"]

    def sort_key(fn: str) -> tuple[int, str, str]:
        m = _NUMERIC_PREFIX_RE.match(fn)
        if not m:
            return (10_000, "", fn)
        return (int(m.group(1)), m.group(2), fn)

    return sorted(files, key=sort_key)


def _checklist_from_steps(step_files: list[str]) -> str:
    """Build a `status.md` checklist that collapses variant siblings (4a/4b)."""
    seen_groups: dict[str, list[str]] = {}
    order: list[str] = []
    for fn in step_files:
        m = _NUMERIC_PREFIX_RE.match(fn)
        group_key = m.group(1) if m else fn
        if group_key not in seen_groups:
            seen_groups[group_key] = []
            order.append(group_key)
        seen_groups[group_key].append(fn)

    lines = ["# Status", "", "## Steps", ""]
    for key in order:
        members = seen_groups[key]
        if len(members) == 1:
            lines.append(f"- [ ] {members[0]}")
        else:
            joined = " or ".join(m.split("-", 1)[1].rsplit(".", 1)[0] for m in members)
            lines.append(f"- [ ] Step {key} — choose {joined}")
    lines.append("")
    return "\n".join(lines)


def _unique_dir_name(repo: Path, base: str) -> str:
    """Return base, or base-2, base-3, ... that doesn't collide on disk."""
    if not (repo / base).exists():
        return base
    i = 2
    while (repo / f"{base}-{i}").exists():
        i += 1
    return f"{base}-{i}"


# Public API

def list_workflows() -> list[WorkflowSummary]:
    """Return all `kind: workflow` modules with metadata + in-flight run counts."""
    out: list[WorkflowSummary] = []
    # Pre-build a count of in-flight runs per parent_workflow
    runs_per_workflow: dict[str, int] = {}
    for name in git_repo.list_modules():
        try:
            manifest = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if (
            manifest.kind == "task"
            and manifest.parent_workflow
            and not manifest.archived
        ):
            runs_per_workflow[manifest.parent_workflow] = (
                runs_per_workflow.get(manifest.parent_workflow, 0) + 1
            )

    for name in git_repo.list_modules():
        try:
            manifest = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if manifest.kind != "workflow":
            continue
        out.append(WorkflowSummary(
            name=name,
            summary=manifest.summary,
            entry_step=manifest.entry_step,
            steps=_step_files(git_repo.module_dir(name)),
            in_flight_runs=runs_per_workflow.get(name, 0),
        ))
    return out


def start_run(workflow_name: str, title: str) -> RunInfo:
    """Create a new run task for the given workflow.

    Raises WorkflowNotFound if the workflow doesn't exist.
    Raises WorkflowEntryStepMissing if the workflow's entry_step file is absent.
    """
    workflow_dir = git_repo.module_dir(workflow_name)
    if not workflow_dir.is_dir():
        raise WorkflowNotFound(f"Workflow '{workflow_name}' does not exist")
    try:
        wf_manifest = read_manifest(workflow_dir)
    except (OSError, ValueError) as exc:
        raise WorkflowNotFound(f"Workflow '{workflow_name}' has invalid manifest: {exc}") from exc
    if wf_manifest.kind != "workflow":
        raise WorkflowNotFound(f"Module '{workflow_name}' is not a workflow")
    if not wf_manifest.entry_step:
        raise WorkflowEntryStepMissing(
            f"Workflow '{workflow_name}' has no entry_step set"
        )
    if not (workflow_dir / "steps" / wf_manifest.entry_step).is_file():
        raise WorkflowEntryStepMissing(
            f"Workflow '{workflow_name}' entry_step '{wf_manifest.entry_step}' not found in steps/"
        )

    title = title.strip()
    if not title:
        raise ValueError("title must not be empty")

    title_slug = slugify_task_name(title)
    if not title_slug:
        raise ValueError(f"title '{title}' did not yield a usable slug")

    base = f"{workflow_name}-run-{title_slug}"
    base = validate_module_name(base)  # raises if illegal

    repo_root = git_repo.module_dir(workflow_name).parent  # modules-repo/
    final = _unique_dir_name(repo_root, base)
    run_dir = repo_root / final
    run_dir.mkdir()

    # status.md — checklist seeded from workflow steps
    step_files = _step_files(workflow_dir)
    (run_dir / "status.md").write_text(_checklist_from_steps(step_files))

    # info.md — title + creation date
    today = datetime.now(timezone.utc).date().isoformat()
    (run_dir / "info.md").write_text(f"# {title}\n\nCreated: {today}\n")

    # module.yaml
    write_manifest(run_dir, ModuleManifest(
        name=final,
        kind="task",
        summary=title,
        parent_workflow=workflow_name,
    ))

    # llms.txt — minimal, satisfies the universal validator check
    (run_dir / "llms.txt").write_text(
        f"# {title}\n> Run of workflow '{workflow_name}'\n\n- [info.md](info.md)\n- [status.md](status.md)\n"
    )

    # Trigger the always-loaded mechanism so the new run task is symlinked into context/.
    reload_workspace(get_loaded_module_names())

    return RunInfo(run_task_name=final, path=run_dir)
```

- [ ] **Step 5: Run tests, verify pass**

```bash
cd platform && uv run pytest tests/test_workflows_service.py -v
```
Expected: all green. If `git_repo.MODULES_REPO_DIR` patching is the issue, mirror the existing pattern from `test_workspace_inspect.py` — sometimes you need to monkeypatch `settings.MODULES_REPO_DIR` instead.

- [ ] **Step 6: Commit**

```bash
git add platform/src/services/workflows.py platform/tests/test_workflows_service.py
git commit -m "feat(workflows): add workflows service (list_workflows, start_run)"
```

---

## Task 7: Build `routes/workflows.py` and mount it

**Files:**
- Create: `platform/src/routes/workflows.py`
- Create: `platform/tests/test_workflows_routes.py`
- Modify: `platform/src/server.py`

Two routes: `GET /api/workflows` and `POST /api/workflows/{workflow}/runs`. Map service errors to HTTP status codes.

- [ ] **Step 1: Write failing route tests**

Create `platform/tests/test_workflows_routes.py`:

```python
import yaml
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    from src.services import git_repo
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    # Stub reload_workspace inside the workflows service
    from src.services import workflows as wf_module
    monkeypatch.setattr(wf_module, "reload_workspace", lambda names: None)
    from src.server import app
    return TestClient(app), tmp_path


def _make_wf(repo, name, steps=("1-intake.md",)):
    d = repo / name
    d.mkdir()
    d.joinpath("module.yaml").write_text(
        yaml.dump({"name": name, "kind": "workflow", "entry_step": steps[0]})
    )
    d.joinpath("info.md").write_text(f"# {name}\n")
    d.joinpath("llms.txt").write_text(f"# {name}\n> wf\n")
    sdir = d / "steps"
    sdir.mkdir()
    for s in steps:
        (sdir / s).write_text(f"# {s}\n")


def test_list_workflows_endpoint(client):
    c, repo = client
    _make_wf(repo, "maat-support", steps=("1-intake.md", "2-plan.md"))
    resp = c.get("/api/workflows")
    assert resp.status_code == 200
    data = resp.json()
    assert "workflows" in data
    assert len(data["workflows"]) == 1
    wf = data["workflows"][0]
    assert wf["name"] == "maat-support"
    assert wf["entry_step"] == "1-intake.md"
    assert wf["steps"] == ["1-intake.md", "2-plan.md"]
    assert wf["in_flight_runs"] == 0


def test_start_run_endpoint(client):
    c, repo = client
    _make_wf(repo, "maat-support")
    resp = c.post("/api/workflows/maat-support/runs", json={"title": "SUP-42 refund"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["run_task_name"] == "maat-support-run-sup-42-refund"
    assert (repo / data["run_task_name"]).is_dir()


def test_start_run_unknown_workflow_returns_404(client):
    c, _ = client
    resp = c.post("/api/workflows/nope/runs", json={"title": "x"})
    assert resp.status_code == 404


def test_start_run_missing_entry_step_returns_400(client):
    c, repo = client
    d = repo / "wf"
    d.mkdir()
    d.joinpath("module.yaml").write_text(
        "name: wf\nkind: workflow\nentry_step: 1-missing.md\n"
    )
    d.joinpath("info.md").write_text("# wf\n")
    (d / "steps").mkdir()
    resp = c.post("/api/workflows/wf/runs", json={"title": "x"})
    assert resp.status_code == 400


def test_start_run_empty_title_returns_400(client):
    c, repo = client
    _make_wf(repo, "wf")
    resp = c.post("/api/workflows/wf/runs", json={"title": "   "})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_workflows_routes.py -v
```
Expected: 404s on the endpoints (router not mounted) or import failures.

- [ ] **Step 3: Implement the router**

Create `platform/src/routes/workflows.py`:

```python
"""Workflow listing and run-creation routes."""
from dataclasses import asdict

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.services import workflows as wf_service

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class StartRunRequest(BaseModel):
    title: str


@router.get("")
async def api_list_workflows():
    summaries = wf_service.list_workflows()
    return {"workflows": [
        {
            "name": s.name,
            "summary": s.summary,
            "entry_step": s.entry_step,
            "steps": s.steps,
            "in_flight_runs": s.in_flight_runs,
        }
        for s in summaries
    ]}


@router.post("/{workflow}/runs", status_code=201)
async def api_start_run(workflow: str, body: StartRunRequest):
    if not body.title or not body.title.strip():
        return JSONResponse({"error": "title must not be empty"}, status_code=400)
    try:
        info = wf_service.start_run(workflow, body.title)
    except wf_service.WorkflowNotFound as exc:
        return JSONResponse({"error": str(exc)}, status_code=404)
    except wf_service.WorkflowEntryStepMissing as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    return {"run_task_name": info.run_task_name, "path": str(info.path)}
```

- [ ] **Step 4: Mount the router in `server.py`**

In `platform/src/server.py`, add the import alongside other route imports:

```python
from src.routes.workflows import router as workflows_router
```

And in the `include_router` block (after `jobs_router`):

```python
app.include_router(workflows_router)
```

- [ ] **Step 5: Run tests, verify pass**

```bash
cd platform && uv run pytest tests/test_workflows_routes.py -v
```

- [ ] **Step 6: Commit**

```bash
git add platform/src/routes/workflows.py platform/src/server.py platform/tests/test_workflows_routes.py
git commit -m "feat(workflows): add /api/workflows routes (list + start_run)"
```

---

## Task 8: Convert `COMMANDS` to dynamic `list_commands()` with workflow auto-registration

**Files:**
- Modify: `platform/src/commands.py`
- Modify: `platform/src/routes/commands.py`
- Test: `platform/tests/test_commands.py`

The slash-command registry becomes a function call recomputed on every `GET /api/commands` request. Workflows auto-register as `/<workflow-name>` with a fixed seed-message prompt template.

- [ ] **Step 1: Read the current registry shape and route**

```bash
cd platform && cat src/commands.py | tail -50
cd platform && cat src/routes/commands.py
cd platform && cat tests/test_commands.py | head -30
```

- [ ] **Step 2: Write failing tests**

Append to `platform/tests/test_commands.py`:

```python
def test_list_commands_includes_static_set():
    """Existing static commands remain in the list."""
    from src.commands import list_commands
    names = {c.name for c in list_commands()}
    # Spot check — at least these are always present
    assert "download" in names
    assert "add-integration" in names


def test_list_commands_auto_registers_workflows(tmp_path, monkeypatch):
    from src.services import git_repo
    from src import commands as cmd_module
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "maat-support").mkdir()
    (tmp_path / "maat-support" / "module.yaml").write_text(
        "name: maat-support\nkind: workflow\nentry_step: 1-intake.md\n"
    )
    (tmp_path / "maat-support" / "info.md").write_text("# maat-support\n")

    names = {c.name for c in cmd_module.list_commands()}
    assert "maat-support" in names

    # Find the auto-registered command and inspect its prompt
    cmd = next(c for c in cmd_module.list_commands() if c.name == "maat-support")
    assert "maat-support" in cmd.prompt
    assert "1-intake.md" in cmd.prompt


def test_list_commands_excludes_archived_or_non_workflow(tmp_path, monkeypatch):
    from src.services import git_repo
    from src import commands as cmd_module
    monkeypatch.setattr(git_repo, "MODULES_REPO_DIR", tmp_path)
    (tmp_path / "linear").mkdir()
    (tmp_path / "linear" / "module.yaml").write_text("name: linear\nkind: integration\n")
    (tmp_path / "linear" / "info.md").write_text("# linear\n")

    names = {c.name for c in cmd_module.list_commands()}
    assert "linear" not in names  # integrations don't auto-register
```

- [ ] **Step 3: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_commands.py -v -k "list_commands"
```
Expected: `ImportError: cannot import name 'list_commands' from 'src.commands'`.

- [ ] **Step 4: Refactor `commands.py`**

In `platform/src/commands.py`:

1. Keep the static `COMMANDS` list as `_STATIC_COMMANDS` (rename, keep the same entries).
2. Add a `_workflow_command(name, entry_step)` builder.
3. Add `list_commands()` that returns `_STATIC_COMMANDS + workflow_commands`.

```python
# Renamed: keep this list at module load. Workflow commands are recomputed
# each call so they reflect the current modules-repo state.
_STATIC_COMMANDS: list[CommandDef] = [
    # ... (existing entries unchanged) ...
]


_WORKFLOW_PROMPT_TEMPLATE = (
    "Begin a new run of the {workflow_name} workflow.\n"
    "Read steps/{entry_step} from the workflow folder and follow it exactly.\n"
    "The step's prose will tell you to call POST /api/workflows/"
    "{workflow_name}/runs with a one-line title to create the run task."
)


def _workflow_command(name: str, entry_step: str) -> CommandDef:
    return CommandDef(
        name=name,
        description=f"Start a new run of the '{name}' workflow",
        prompt=_WORKFLOW_PROMPT_TEMPLATE.format(workflow_name=name, entry_step=entry_step),
    )


def list_commands() -> list[CommandDef]:
    """Return static commands plus one auto-registered command per workflow.

    Recomputed on every call. Reads the modules repo directly.
    """
    # Local imports to avoid a circular at module load (services may import commands).
    from src.services import git_repo
    from src.services.manifest import read_manifest

    workflow_cmds: list[CommandDef] = []
    for name in git_repo.list_modules():
        try:
            m = read_manifest(git_repo.module_dir(name))
        except (OSError, ValueError):
            continue
        if m.kind == "workflow" and m.entry_step:
            workflow_cmds.append(_workflow_command(name, m.entry_step))
    return [*_STATIC_COMMANDS, *workflow_cmds]
```

Delete the old `COMMANDS = [...]` symbol — `list_commands()` replaces it.

- [ ] **Step 5: Update the route**

In `platform/src/routes/commands.py`, replace the `COMMANDS` import:

```python
from src.commands import list_commands
```

And change the route handler to call it:

```python
@router.get("")
async def api_list_commands():
    return {"commands": [
        {"name": c.name, "description": c.description, "prompt": c.prompt}
        for c in list_commands()
    ]}
```

(Match the response shape the route currently returns — adjust field names if the existing version uses something different. Keep behavior identical for static commands.)

- [ ] **Step 6: Run tests, verify pass**

```bash
cd platform && uv run pytest tests/test_commands.py -v
```

- [ ] **Step 7: Verify nothing else imported the old `COMMANDS` symbol**

```bash
cd platform && grep -rn "from src.commands import COMMANDS\|src\.commands\.COMMANDS" src/ tests/
```
Expected: no matches. If matches exist outside `_SUMMARY_PROMPT`/`_DETECT_PACKAGES_PROMPT` (which stay), update them to call `list_commands()`.

- [ ] **Step 8: Commit**

```bash
git add platform/src/commands.py platform/src/routes/commands.py platform/tests/test_commands.py
git commit -m "feat(workflows): auto-register slash command per workflow module"
```

---

## Task 9: Per-kind dispatch in `validate_modules.py` + workflow checks

**Files:**
- Modify: `platform/src/scripts/validate_modules.py`

Refactor `validate_module(module_dir)` so the integration-shaped checks (Purpose / Auth & access / secrets cross-check / dependencies cross-check / code-block convention) only run for `kind: integration`. Add a `workflow` branch that runs:
- universal checks (`module.yaml` parses, `info.md` exists, `llms.txt` exists, name matches dir, no forbidden files)
- workflow-specific: `entry_step` is set, `steps/` dir exists, `entry_step` filename is inside `steps/`

Tasks keep universal-only behavior. Tasks with `parent_workflow` set get a non-blocking WARN if the named workflow doesn't exist.

This script has no existing test file. Add a small one.

- [ ] **Step 1: Create `platform/tests/test_validate_modules.py` with failing tests**

```python
from pathlib import Path

import pytest


def _write_min_module(d: Path, kind: str, **extras):
    """Write the bare-minimum files to satisfy the universal validator branch."""
    d.mkdir(parents=True, exist_ok=True)
    body = {"name": d.name, "kind": kind, **extras}
    import yaml
    (d / "module.yaml").write_text(yaml.dump(body))
    (d / "info.md").write_text(f"# {d.name}\n\nDescription.\n")
    (d / "llms.txt").write_text(f"# {d.name}\n> summary\n\n- [info.md](info.md)\n")


def _validate(module_dir):
    from src.scripts.validate_modules import validate_module
    return validate_module(module_dir)


def test_workflow_with_steps_passes(tmp_path):
    d = tmp_path / "wf"
    _write_min_module(d, "workflow", entry_step="1-intake.md")
    (d / "steps").mkdir()
    (d / "steps" / "1-intake.md").write_text("# intake\n")
    issues = _validate(d)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert errors == []


def test_workflow_missing_entry_step_errors(tmp_path):
    d = tmp_path / "wf"
    _write_min_module(d, "workflow")  # no entry_step
    (d / "steps").mkdir()
    (d / "steps" / "1-intake.md").write_text("# intake\n")
    issues = _validate(d)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert any("entry_step" in m for _, m in errors)


def test_workflow_missing_steps_dir_errors(tmp_path):
    d = tmp_path / "wf"
    _write_min_module(d, "workflow", entry_step="1-intake.md")
    issues = _validate(d)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert any("steps" in m.lower() for _, m in errors)


def test_workflow_entry_step_not_in_steps_dir_errors(tmp_path):
    d = tmp_path / "wf"
    _write_min_module(d, "workflow", entry_step="1-intake.md")
    (d / "steps").mkdir()
    (d / "steps" / "2-plan.md").write_text("# plan\n")
    issues = _validate(d)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert any("1-intake.md" in m for _, m in errors)


def test_workflow_does_NOT_run_integration_checks(tmp_path):
    """Workflows with no Purpose/Auth&access sections should not WARN."""
    d = tmp_path / "wf"
    _write_min_module(d, "workflow", entry_step="1-intake.md")
    (d / "steps").mkdir()
    (d / "steps" / "1-intake.md").write_text("# intake\n")
    issues = _validate(d)
    # No 'Purpose' / 'Auth & access' / etc. warnings
    assert not any("Purpose" in m or "Auth & access" in m for _, m in issues)


def test_task_with_known_parent_workflow_passes(tmp_path):
    # Set up a workflow first
    wf = tmp_path / "wf"
    _write_min_module(wf, "workflow", entry_step="1-intake.md")
    (wf / "steps").mkdir()
    (wf / "steps" / "1-intake.md").write_text("# intake\n")
    # Then a task pointing at it
    run = tmp_path / "wf-run-x"
    _write_min_module(run, "task", parent_workflow="wf")
    issues = _validate(run)
    errors = [i for i in issues if i[0] == "ERROR"]
    assert errors == []


def test_task_with_unknown_parent_workflow_warns(tmp_path):
    run = tmp_path / "orphan-run"
    _write_min_module(run, "task", parent_workflow="vanished")
    issues = _validate(run)
    warns = [i for i in issues if i[0] == "WARN"]
    assert any("vanished" in m or "parent_workflow" in m.lower() for _, m in warns)
```

(The `parent_workflow` warning needs the validator to know the repo root — currently `validate_module(module_dir)` only sees the module's own dir. The simplest fix: walk `module_dir.parent` to look for the parent workflow. The `_validate` helper above uses `tmp_path` as the repo root, so this works.)

- [ ] **Step 2: Run, verify failure**

```bash
cd platform && uv run pytest tests/test_validate_modules.py -v
```
Expected: failures across the board.

- [ ] **Step 3: Refactor the validator**

In `platform/src/scripts/validate_modules.py`, restructure `validate_module(module_dir)`:

```python
def validate_module(module_dir: Path) -> list[Issue]:
    issues: list[Issue] = []
    name = module_dir.name

    # ---- Universal: required + forbidden files ----
    info_path = module_dir / "info.md"
    manifest_path = module_dir / "module.yaml"
    if not info_path.exists():
        issues.append((ERROR, "Missing required file: info.md"))
    if not manifest_path.exists():
        issues.append((ERROR, "Missing required file: module.yaml"))
    for forbidden in (".env", ".env.schema", "requirements.txt"):
        if (module_dir / forbidden).exists():
            issues.append((ERROR, f"Forbidden file present: {forbidden}"))

    # ---- Parse manifest ----
    manifest: dict[str, object] = {}
    if manifest_path.exists():
        try:
            manifest = yaml.safe_load(manifest_path.read_text()) or {}
        except yaml.YAMLError as e:
            issues.append((ERROR, f"module.yaml is invalid YAML: {e}"))
            manifest = {}
        if manifest:
            if "name" not in manifest:
                issues.append((ERROR, "module.yaml missing 'name' field"))
            elif manifest["name"] != name:
                issues.append((ERROR, f"module.yaml name '{manifest['name']}' does not match directory name '{name}'"))
            if not manifest.get("summary"):
                issues.append((WARN, "module.yaml missing 'summary' field"))

    kind = (manifest.get("kind") or "integration") if manifest else "integration"

    # ---- Universal: llms.txt + link integrity ----
    llms_path = module_dir / "llms.txt"
    if not llms_path.exists():
        issues.append((WARN, "Missing recommended file: llms.txt"))
    else:
        llms_content = llms_path.read_text()
        for link in re.findall(r"\[.*?\]\((.*?)\)", llms_content):
            if not (module_dir / link).exists():
                issues.append((ERROR, f"llms.txt links to non-existent file: {link}"))

    # ---- Per-kind dispatch ----
    if kind == "integration":
        issues.extend(_validate_integration(module_dir, manifest, info_path))
    elif kind == "workflow":
        issues.extend(_validate_workflow(module_dir, manifest))
    elif kind == "task":
        issues.extend(_validate_task(module_dir, manifest))

    return issues


def _validate_integration(module_dir: Path, manifest: dict, info_path: Path) -> list[Issue]:
    """The pre-existing integration-shaped checks. Extracted unchanged."""
    issues: list[Issue] = []
    if not info_path.exists():
        return issues
    info_content = info_path.read_text()
    if not _has_top_heading(info_content):
        issues.append((WARN, "info.md missing top-level # heading"))
    recommended_sections = [
        "Purpose", "Where it lives", "Auth & access",
        "Key entities", "Operations", "Examples",
    ]
    for section in recommended_sections:
        if not _has_heading(info_content, 2, section):
            issues.append((WARN, f"info.md missing recommended section: ## {section}"))
    # ... move ALL of the existing secrets/dependencies cross-check + code-block
    # checks from the old validate_module body here, unchanged ...
    return issues


def _validate_workflow(module_dir: Path, manifest: dict) -> list[Issue]:
    issues: list[Issue] = []
    entry = manifest.get("entry_step")
    if not entry:
        issues.append((ERROR, "Workflow module.yaml missing 'entry_step' field"))
    steps_dir = module_dir / "steps"
    if not steps_dir.is_dir():
        issues.append((ERROR, "Workflow missing required 'steps/' directory"))
    elif entry and not (steps_dir / entry).is_file():
        issues.append((ERROR, f"Workflow entry_step '{entry}' not found in steps/"))
    return issues


def _validate_task(module_dir: Path, manifest: dict) -> list[Issue]:
    issues: list[Issue] = []
    parent = manifest.get("parent_workflow")
    if parent:
        parent_dir = module_dir.parent / parent
        if not parent_dir.is_dir():
            issues.append((WARN, f"parent_workflow '{parent}' does not exist in modules repo"))
        else:
            try:
                parent_manifest = yaml.safe_load((parent_dir / "module.yaml").read_text()) or {}
                if parent_manifest.get("kind") != "workflow":
                    issues.append((WARN, f"parent_workflow '{parent}' exists but is not kind: workflow"))
            except (OSError, yaml.YAMLError):
                issues.append((WARN, f"parent_workflow '{parent}' has unreadable manifest"))
    return issues
```

Move the existing per-integration logic (secrets cross-check, dependencies cross-check, code-block conventions) out of the old `validate_module` body and into `_validate_integration`. **Do not change any of that logic** — just relocate it.

- [ ] **Step 4: Run, verify pass**

```bash
cd platform && uv run pytest tests/test_validate_modules.py -v
```

- [ ] **Step 5: Smoke-test against the real modules repo**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && uv run python platform/src/scripts/validate_modules.py
```
Expected: no NEW errors against existing integrations/tasks (the integration checks were just relocated, not changed).

- [ ] **Step 6: Commit**

```bash
git add platform/src/scripts/validate_modules.py platform/tests/test_validate_modules.py
git commit -m "feat(workflows): per-kind dispatch in validator + workflow checks"
```

---

## Task 10: Frontend API client (`api/workflows.ts`)

**Files:**
- Create: `platform/frontend/src/api/workflows.ts`

Mirror the shape of `api/jobs.ts`. No `startRun` client — the agent is what calls the route, not the frontend.

- [ ] **Step 1: Create the file**

```typescript
import { apiFetch } from "./client";

export type Workflow = {
  name: string;
  summary: string;
  entry_step: string | null;
  steps: string[];           // filenames in steps/, sorted by numeric prefix
  in_flight_runs: number;
};

export async function fetchWorkflows(): Promise<Workflow[]> {
  const data: { workflows: Workflow[] } = await apiFetch("/workflows");
  return data.workflows;
}
```

- [ ] **Step 2: Verify the type aligns with the route's response shape**

Cross-check against `routes/workflows.py::api_list_workflows` — fields must match exactly.

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/api/workflows.ts
git commit -m "feat(workflows): add frontend api client"
```

---

## Task 11: Frontend `WorkflowsGroup.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/WorkflowsGroup.tsx`

Mirror `WorkspaceGroup.tsx`'s collapsible structure but render workflows. Each workflow is a card showing: name, in-flight run count, expandable list of steps + in-flight runs, "Start run" button, edit (opens existing `ModuleEditorModal`).

- [ ] **Step 1: Read `WorkspaceGroup.tsx` end-to-end as a structural reference**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && cat platform/frontend/src/components/sidebar/WorkspaceGroup.tsx
```

- [ ] **Step 2: Create the component**

```typescript
import { useState } from "react";
import { ChevronDown, ChevronRight, Play, Edit2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ModuleInfo } from "../../api/modules";
import { fetchWorkflows, type Workflow } from "../../api/workflows";
import { useModuleEditorStore } from "../../hooks/useModuleEditorStore";
import { StartRunModal } from "./StartRunModal";

interface WorkflowsGroupProps {
  /** All task modules — used to surface in-flight runs nested under each workflow. */
  tasks: ModuleInfo[];
}

export function WorkflowsGroup({ tasks }: WorkflowsGroupProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [startRunFor, setStartRunFor] = useState<string | null>(null);
  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: fetchWorkflows,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="text-[9px] italic text-text-muted px-2.5 py-2">
        loading workflows...
      </div>
    );
  }
  if (workflows.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted px-2.5">
        Workflows
      </div>
      {workflows.map((w) => {
        const runs = tasks.filter((t) => t.parent_workflow === w.name);
        const isOpen = expanded[w.name] ?? false;
        return (
          <div
            key={w.name}
            className="border border-border bg-bg-hover rounded-md"
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((e) => ({ ...e, [w.name]: !isOpen }))
              }
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            >
              {isOpen
                ? <ChevronDown className="w-3 h-3 text-text-muted" />
                : <ChevronRight className="w-3 h-3 text-text-muted" />}
              <span className="flex-1 text-xs font-semibold text-text">
                {w.name}
              </span>
              <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full font-semibold">
                {w.in_flight_runs} in flight
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border/60 px-2.5 py-2 space-y-2">
                {/* Steps list */}
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    Steps
                  </div>
                  <ul className="space-y-px text-[11px] font-mono text-text-secondary">
                    {w.steps.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
                {/* In-flight runs */}
                {runs.length > 0 && (
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-wider text-text-muted mb-1">
                      Runs
                    </div>
                    <ul className="space-y-px text-[11px] text-text-secondary">
                      {runs.map((r) => (
                        <li key={r.name}>
                          <button
                            type="button"
                            onClick={() => openModuleEditor(r.name)}
                            className="hover:text-accent text-left w-full truncate"
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* Footer actions */}
                <div className="flex items-center justify-between border-t border-border/50 pt-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setStartRunFor(w.name)}
                    className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Start run
                  </button>
                  <button
                    type="button"
                    onClick={() => openModuleEditor(w.name)}
                    className="text-[10px] text-text-muted hover:text-accent flex items-center gap-1"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {startRunFor && (
        <StartRunModal
          workflow={startRunFor}
          onClose={() => setStartRunFor(null)}
        />
      )}
    </div>
  );
}
```

(`StartRunModal` doesn't exist yet — Task 12 creates it. The import will be unresolved until then; keep going, the dev server will surface the error and Task 12 fixes it.)

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/components/sidebar/WorkflowsGroup.tsx
git commit -m "feat(workflows): add WorkflowsGroup sidebar component"
```

---

## Task 12: Frontend `StartRunModal.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/StartRunModal.tsx`

Free-text input "what's this run about?". On submit, builds the canonical seed message (with the user's title inlined), calls `useChatStore.sendMessage(activeSessionId, seedText)`, closes.

- [ ] **Step 1: Read the chat store to confirm `sendMessage`'s signature**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && grep -n "sendMessage" platform/frontend/src/hooks/useChatStore.ts | head
```
Confirms `sendMessage(sessionId: string | null, prompt: string) => void`.

- [ ] **Step 2: Create the modal**

```typescript
import { useState } from "react";
import { Modal } from "../Modal";
import { useChatStore } from "../../hooks/useChatStore";

interface StartRunModalProps {
  workflow: string;
  onClose: () => void;
}

export function StartRunModal({ workflow, onClose }: StartRunModalProps) {
  const [title, setTitle] = useState("");
  const sendMessage = useChatStore((s) => s.sendMessage);
  const activeSessionId = useChatStore((s) => s.activeSessionId);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    // Canonical seed message (matches spec § Run lifecycle).
    const seed = [
      `Begin a new run of the ${workflow} workflow.`,
      `Title: "${trimmed}"`,
      `Read the entry step from the ${workflow} workflow folder and follow it exactly.`,
      `The step's prose will tell you to call POST /api/workflows/${workflow}/runs with this title to create the run task.`,
    ].join("\n");
    sendMessage(activeSessionId, seed);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-4 space-y-3 min-w-[360px]">
        <h2 className="text-sm font-semibold text-text">
          Start run — {workflow}
        </h2>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
            What's this run about?
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="e.g. SUP-42 refund subscription"
            className="w-full px-2 py-1.5 text-sm bg-bg border border-border rounded focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-3 py-1 text-xs bg-accent text-white rounded disabled:opacity-50"
          >
            Start
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

(The `Modal` import path matches `platform/frontend/src/components/Modal.tsx`. The selector field name `activeSessionId` should match the store's actual field — grep `useChatStore.ts` to confirm; if it's `activeClaudeSessionId` or similar, update.)

- [ ] **Step 3: Verify imports against the live store**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && grep -E "activeSessionId|activeClaudeSessionId" platform/frontend/src/hooks/useChatStore.ts
```
Update the field name in the modal if needed.

- [ ] **Step 4: Commit**

```bash
git add platform/frontend/src/components/sidebar/StartRunModal.tsx
git commit -m "feat(workflows): add StartRunModal"
```

---

## Task 13: `[from <workflow>]` badge on `TaskCard`

**Files:**
- Modify: `platform/frontend/src/components/sidebar/cards/TaskCard.tsx`

Render a small badge `from <workflow_name>` when `info.parent_workflow` is set. Visually distinct (muted background) so it doesn't compete with the task title.

- [ ] **Step 1: Modify `TaskCard`**

In `platform/frontend/src/components/sidebar/cards/TaskCard.tsx`, modify the `headerMiddle` element so when `info.parent_workflow` is set, a badge renders next to the name:

```typescript
  const headerMiddle = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-text truncate">
          {info.name}
        </span>
        {info.parent_workflow && (
          <span
            className="text-[8px] font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0"
            title={`Run of workflow: ${info.parent_workflow}`}
          >
            from {info.parent_workflow}
          </span>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 2: Manual verification**

Start the dev server, create a workflow on disk in `modules-repo/` (a minimal one — `module.yaml` with `kind: workflow`, `entry_step: 1-intake.md`, `steps/1-intake.md`, `info.md`, `llms.txt`), then start a run. Verify the resulting run task shows the badge in Active Tasks.

- [ ] **Step 3: Commit**

```bash
git add platform/frontend/src/components/sidebar/cards/TaskCard.tsx
git commit -m "feat(workflows): show [from <workflow>] badge on run task cards"
```

---

## Task 14: Mount `WorkflowsGroup` in `ContextPanel`

**Files:**
- Modify: `platform/frontend/src/components/ContextPanel.tsx`

Place the `WorkflowsGroup` above the existing tasks zone. Pass the current task list so it can compute nested in-flight runs.

- [ ] **Step 1: Read `ContextPanel.tsx` to find where the tasks zone is rendered**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && grep -n "Active Tasks\|TaskCard\|tasks.map\|kind.*task" platform/frontend/src/components/ContextPanel.tsx
```

- [ ] **Step 2: Insert `WorkflowsGroup`**

Above the Active Tasks zone, mount:

```typescript
import { WorkflowsGroup } from "./sidebar/WorkflowsGroup";

// ...where the tasks list is in scope:
<WorkflowsGroup tasks={tasks} />
```

The `tasks` prop should be the same array already feeding the Active Tasks zone — re-use it; do not refetch. If the existing component fetches modules differently, adjust the prop accordingly.

- [ ] **Step 3: Manual verification**

```bash
make dev    # or whatever starts the local stack
```
Open the UI, confirm the Workflows zone renders above Active Tasks. Add a test workflow to the modules repo, refresh, confirm it appears with 0 runs. Click Start run, type a title, confirm a chat message is seeded and a new task appears (after the agent calls the route).

- [ ] **Step 4: Commit**

```bash
git add platform/frontend/src/components/ContextPanel.tsx
git commit -m "feat(workflows): mount WorkflowsGroup in ContextPanel"
```

---

## Task 15: Update `llms.txt`

**Files:**
- Modify: `llms.txt`

Add entries under "Platform Backend" for the new files. Keep the one-line description per entry.

- [ ] **Step 1: Add entries**

Insert these lines under the existing Platform Backend section (in a sensible position — group near related files):

```
- [platform/src/services/workflows.py](platform/src/services/workflows.py) — Workflow listing + run creation; defines WorkflowSummary, RunInfo, WorkflowNotFound, WorkflowEntryStepMissing
- [platform/src/routes/workflows.py](platform/src/routes/workflows.py) — Workflow routes (GET /api/workflows, POST /api/workflows/{w}/runs)
- [platform/frontend/src/api/workflows.ts](platform/frontend/src/api/workflows.ts) — Workflows API client (fetchWorkflows; Workflow type)
- [platform/frontend/src/components/sidebar/WorkflowsGroup.tsx](platform/frontend/src/components/sidebar/WorkflowsGroup.tsx) — Sidebar Workflows zone — collapsible cards per workflow with steps, in-flight runs, Start-run button
- [platform/frontend/src/components/sidebar/StartRunModal.tsx](platform/frontend/src/components/sidebar/StartRunModal.tsx) — Modal that collects a run title and seeds the chat with the canonical workflow start message
```

- [ ] **Step 2: Commit**

```bash
git add llms.txt
git commit -m "docs: link new workflow files in llms.txt"
```

---

## Final verification

- [ ] Run the full backend test suite

```bash
cd platform && uv run pytest tests/ -v
```
Expected: all green. Pay special attention to any test in `test_workspace_inspect.py`, `test_create_module.py`, `test_register.py`, `test_commands.py`, `test_jobs_*.py` — these touch the same files this plan modifies.

- [ ] Run the validator against the real modules repo

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader && uv run python platform/src/scripts/validate_modules.py
```
Expected: no NEW errors against pre-existing integrations or tasks.

- [ ] Manual end-to-end via the dev server

1. Author a minimal workflow on disk:
   ```
   modules-repo/test-workflow/
   ├── module.yaml          (kind: workflow, entry_step: 1-intake.md)
   ├── info.md
   ├── llms.txt
   └── steps/
       ├── 1-intake.md      (says: "Ask the user for X. Then call POST /api/workflows/test-workflow/runs with a title.")
       └── 2-finish.md
   ```
2. Restart the dev server, confirm `test-workflow` appears in the Workflows zone with 0 runs.
3. Click Start run, type a title, confirm chat opens with the seeded message.
4. Let the agent call the route — confirm a new task appears under both the Workflows zone (nested) and Active Tasks (with `from test-workflow` badge).
5. Confirm typing `/test-workflow` directly in chat (without the modal) also starts the same flow.

If any of these fail: the bug is in the corresponding task above. Fix forward.
