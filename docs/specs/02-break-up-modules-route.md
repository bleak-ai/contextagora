# Spec 02 — Break up `routes/modules.py`

## Goal

Shrink `routes/modules.py` from 459 lines to a thin HTTP-handler file. Pull scaffolding into the manifest service, move the Claude-subprocess helper to a shared service (see spec 09), and externalize the two inline Python-string prompts into markdown under `src/prompts/internal/` so they get convention injection like every other prompt.

## Answers driving this spec

- Scaffolding lives **inside `services/manifest.py`**.
- Claude-subprocess helper is **unified** under a shared service (`services/claude.py` — spec 09).
- Internal prompts go in **`src/prompts/internal/`**.
- Internal prompts **DO** get `{conventions}` injection.
- Scaffold dispatch uses a **`ModuleKind` enum** with per-kind behavior.

## Current state

`platform/src/routes/modules.py` (459 lines) contains:

- HTTP handlers (list / get / create / register / update / delete / archive / unarchive / files CRUD / generate / detect-packages).
- Scaffolding functions `_scaffold_integration`, `_scaffold_task`, dict `_SCAFFOLD_FN`, constant `VALID_KINDS` (lines 120-168).
- Claude subprocess env + helper `_run_claude_headless` (lines 300-319).
- Two inline prompt templates `_GENERATE_PROMPT_TEMPLATE`, `_DETECT_PACKAGES_PROMPT` (lines 322-384).

## Target shape

```
src/
  services/
    manifest.py                 ← extended with ModuleKind enum + scaffolders
    claude.py                   ← NEW (spec 09) — run_headless() + stream()
  prompts/
    internal/                   ← NEW
      summary.md                ← was _GENERATE_PROMPT_TEMPLATE
      detect_packages.md        ← was _DETECT_PACKAGES_PROMPT
  routes/
    modules.py                  ← HTTP only, target ~150-200 lines
  commands.py                   ← loader updated for prompts/internal/
```

## Implementation steps

### 1. `ModuleKind` enum in `services/manifest.py`

Replace the free-standing `_scaffold_*` functions and `_SCAFFOLD_FN` dict with a structured enum:

```python
from enum import Enum

class ModuleKind(str, Enum):
    INTEGRATION = "integration"
    TASK = "task"

    def scaffold(self, slug: str, body: CreateModuleRequest) -> None: ...
    @property
    def auto_load(self) -> bool: ...
    @property
    def label(self) -> str: ...  # UI display name, e.g. "Integration"
```

- `scaffold()` dispatches via the enum member (methods or a module-level dispatcher — either works; pick the one that keeps `manifest.py` under ~150 lines).
- `auto_load` is `False` for integrations, `True` for tasks.
- Drop `VALID_KINDS` — use `ModuleKind(body.kind)` with a clean `ValueError` handler in the route.
- Move `slugify_task_name` into `manifest.py` alongside `ModuleKind` so all module-identity helpers sit together.

### 2. Externalize internal prompts

- Create `platform/src/prompts/internal/summary.md` with the body of `_GENERATE_PROMPT_TEMPLATE`, using `{module_name}` and `{raw_content}` placeholders, plus a `{conventions}` placeholder at the bottom.
- Create `platform/src/prompts/internal/detect_packages.md` similarly with `{raw_content}` and `{conventions}`.
- Update `platform/src/commands.py` — `_load_prompt` already supports arbitrary paths under `_PROMPTS_DIR`. Add convenience loaders:
  ```python
  _SUMMARY_PROMPT = _load_prompt("internal/summary.md", inject_conventions=True)
  _DETECT_PACKAGES_PROMPT = _load_prompt("internal/detect_packages.md", inject_conventions=True)
  ```
- These aren't slash commands, so they're NOT added to the `COMMANDS` list. They're module-level constants used by `routes/modules.py`.

### 3. Unify subprocess helper (spec 09)

Delete `_CLAUDE_HEADLESS_ENV` and `_run_claude_headless` from `routes/modules.py`. Replace with `from src.services.claude import run_headless` (spec 09 defines the shape).

### 4. Slim `routes/modules.py`

After the above moves, the route file should contain only:

- Imports.
- `router = APIRouter(…)` + `_set_module_archived` (small helper — keep or move to `manifest.py` as `set_archived(name, value)`).
- HTTP handlers calling into `services/manifest.py`, `services/git_repo.py`, `services/workspace.py`, `services/claude.py`.

Target: **150-200 lines**, no business logic, no inline prompts.

### 5. Update tests

- `tests/test_task_scaffolding.py`, `tests/test_manifest.py`, `tests/test_create_module.py`, `tests/test_register.py` need their imports updated to `from src.services.manifest import ModuleKind, scaffold` (or whatever API you settle on).
- Verify test suite passes with `uv run pytest`.

## Acceptance

- `routes/modules.py` is 150-200 lines.
- `services/manifest.py` owns `ModuleKind`, scaffolding, and archive-flag toggle.
- No inline prompt strings anywhere in `routes/`.
- `src/prompts/internal/summary.md` and `detect_packages.md` both load with conventions injected.
- All existing module tests pass unchanged (only imports need updating).
- `POST /api/modules/{name}/generate` and `POST /api/modules/{name}/detect-packages` still return the same shape end-to-end.

## Out of scope

- Adding new module kinds (just structuring for them).
- Changing the prompt wording — move them verbatim, then refine in a later spec.
- Touching `CreateModuleRequest` shape.
