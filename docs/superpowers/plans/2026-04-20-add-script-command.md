# /add-script Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new `/add-script` slash command that scaffolds arbitrary Python scripts into `modules-repo/<name>/scripts/`, using the same varlock+`os.environ` plumbing as `verify.py` and surfacing them in the sidebar's existing Scripts section alongside `verify.py`.

**Architecture:** Five small, independent deliverables: (1) extend `list_workspace_files` and (2) extend `list_module_files` to walk `scripts/*.py`; (3) split `_conventions.md` §8 into a generic *Script Contract* (§8) + a narrower *Verify Script* (§9); (4) add a new `commands/add_script.md` prompt file; (5) register the command. No changes to the run endpoint, no frontend changes.

**Tech Stack:** Python 3.12, FastAPI, pytest (+ `tmp_path` fixture), markdown prompts injected at import time.

**Reference spec:** `docs/superpowers/specs/2026-04-20-add-script-command-design.md`

**Standing rules (from `~/.claude/CLAUDE.md`):**
- **Never** run `python` directly — always use `uv run python` / `uv run pytest`.
- **Do not commit** unless the user explicitly asks. The "Stage" steps below stop at `git add`; skip the `git commit` line unless the user has asked for a commit.

---

## File Structure

### Files to create

- `platform/src/prompts/commands/add_script.md` — new command prompt, mirrors the shape of `add_verify.md`
- `platform/tests/test_add_script.py` — tests for the new command registration (new file — keeps the `/add-script` vs `/add-verify` distinction readable in test output)

### Files to modify

- `platform/src/services/workspace_inspect.py` — `list_workspace_files` walks `scripts/*.py` (primary: feeds the main sidebar)
- `platform/src/services/git_repo.py` — `list_module_files` walks `scripts/*.py` (secondary: feeds the ModuleEditor)
- `platform/src/prompts/_conventions.md` — split §8 into §8 + §9; add `scripts/*.py` to §5
- `platform/src/commands.py` — register `/add-script` in `COMMANDS`

### Files NOT to modify (verified in spec review)

- `platform/src/routes/modules.py` — `api_run_module_file` already accepts subpaths
- `platform/src/services/schemas.py` — `validate_module_file_path` already allows `scripts/foo.py`
- `platform/frontend/src/components/sidebar/cards/IntegrationCard.tsx` — already partitions `.py` → Scripts section
- `platform/src/prompts/commands/add_verify.md` and `platform/src/prompts/commands/add_integration.md` — both reference the *Verify Script* section by **name**, so preserving that heading in the new §9 keeps them valid

### Commands

All commands are run from `platform/` unless noted. Never use bare `python`.

- Run all tests: `uv run pytest -v`
- Run a single test file: `uv run pytest tests/test_add_script.py -v`
- Run a single test: `uv run pytest tests/test_run_file.py::test_validator_accepts_py -v`

---

## Task 1: Extend `list_workspace_files` to walk `scripts/*.py`

**Rationale:** `list_workspace_files` (not `list_module_files`) is what feeds the main sidebar — the place the user hits Run. This is the load-bearing backend change.

**Files:**
- Modify: `platform/src/services/workspace_inspect.py:11-35` (the `list_workspace_files` function)
- Test: `platform/tests/test_workspace_inspect.py` (new file)

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_workspace_inspect.py`:

```python
"""Tests for list_workspace_files path walking.

The function drives the main sidebar (GET /api/workspace → IntegrationCard).
Must walk top-level, docs/*.md, and scripts/*.py.
"""
from pathlib import Path

import pytest

from src.services.workspace_inspect import list_workspace_files

MANAGED = frozenset({"module.yaml", "llms.txt"})


def test_returns_empty_when_only_managed_files(tmp_path: Path):
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (tmp_path / "llms.txt").write_text("x")
    assert list_workspace_files(tmp_path, MANAGED) == []


def test_returns_top_level_non_managed_files_alphabetical(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (tmp_path / "verify.py").write_text("print('ok')")
    assert list_workspace_files(tmp_path, MANAGED) == ["info.md", "verify.py"]


def test_returns_docs_md_files_with_prefix(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text("# guide")
    (docs / "overview.md").write_text("# overview")
    # Non-md in docs/ is ignored.
    (docs / "ignored.txt").write_text("skip me")
    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "docs/guide.md",
        "docs/overview.md",
    ]


def test_returns_scripts_py_files_with_prefix(tmp_path: Path):
    (tmp_path / "info.md").write_text("# info")
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    (scripts / "create-issue.py").write_text("print('ok')")
    (scripts / "list-projects.py").write_text("print('ok')")
    # Non-py in scripts/ is ignored.
    (scripts / "notes.md").write_text("skip me")
    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "scripts/create-issue.py",
        "scripts/list-projects.py",
    ]


def test_mixed_top_level_docs_and_scripts_are_ordered(tmp_path: Path):
    """Order contract: top-level alphabetical, then docs alphabetical,
    then scripts alphabetical."""
    (tmp_path / "info.md").write_text("# info")
    (tmp_path / "verify.py").write_text("print('ok')")
    (tmp_path / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")

    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "guide.md").write_text("g")

    scripts = tmp_path / "scripts"
    scripts.mkdir()
    (scripts / "a.py").write_text("a")
    (scripts / "b.py").write_text("b")

    assert list_workspace_files(tmp_path, MANAGED) == [
        "info.md",
        "verify.py",
        "docs/guide.md",
        "scripts/a.py",
        "scripts/b.py",
    ]


def test_raises_when_module_dir_missing(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        list_workspace_files(tmp_path / "nope", MANAGED)
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run pytest tests/test_workspace_inspect.py -v`

Expected: the first three tests pass (existing behavior), the last three (`test_returns_scripts_py_files_with_prefix`, `test_mixed_top_level_docs_and_scripts_are_ordered`) fail with `AssertionError` because `scripts/` is not walked yet. (`test_raises_when_module_dir_missing` should pass — the existing code already raises.)

- [ ] **Step 3: Add `scripts/*.py` walking**

Modify `platform/src/services/workspace_inspect.py`. In `list_workspace_files`, after the existing `docs` block, add the `scripts` block. Replace the current function body with:

```python
def list_workspace_files(
    module_dir: Path,
    managed_files: frozenset[str],
) -> list[str]:
    """Return relative paths of user-visible files inside a workspace module.

    Includes top-level files (excluding managed ones), `.md` files one level
    deep under `docs/`, and `.py` files one level deep under `scripts/`.
    Order: top-level alphabetical, then docs alphabetical, then scripts alphabetical.
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

    scripts = module_dir / "scripts"
    if scripts.is_dir():
        for script in sorted(scripts.iterdir()):
            if script.is_file() and script.name.endswith(".py"):
                paths.append(f"scripts/{script.name}")

    return paths
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_workspace_inspect.py -v`

Expected: all 6 tests pass.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `uv run pytest -v`

Expected: every test passes (no pre-existing test relied on `scripts/` being ignored).

- [ ] **Step 6: Stage**

```bash
git add platform/src/services/workspace_inspect.py platform/tests/test_workspace_inspect.py
# Commit only if the user has explicitly asked.
```

---

## Task 2: Extend `list_module_files` to walk `scripts/*.py`

**Rationale:** `list_module_files` feeds the ModuleEditor's own sidebar. Keeping it consistent with `list_workspace_files` avoids a confusing inconsistency between views.

**Files:**
- Modify: `platform/src/services/git_repo.py:123-142` (the `list_module_files` function)
- Test: `platform/tests/test_git_repo_list_module_files.py` (new file — existing `test_register.py` etc. mock this function, so they don't cover this code path)

- [ ] **Step 1: Write the failing tests**

Create `platform/tests/test_git_repo_list_module_files.py`:

```python
"""Tests for list_module_files path walking.

The function feeds GET /api/modules/{name}/files (ModuleEditor sidebar).
Must walk top-level non-managed files, docs/*.md, and scripts/*.py.
"""
from pathlib import Path

from src.services.git_repo import list_module_files

MANAGED = frozenset({"module.yaml", "llms.txt"})


def _setup_module(clone_dir: Path, name: str) -> Path:
    module_dir = clone_dir / name
    module_dir.mkdir(parents=True)
    (module_dir / "module.yaml").write_text("name: x\nkind: integration\nsummary: x\n")
    (module_dir / "llms.txt").write_text("x")
    return module_dir


def test_empty_when_only_managed(tmp_path: Path):
    _setup_module(tmp_path, "linear")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == []


def test_top_level_md_and_py(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "verify.py").write_text("print('ok')")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == [
        {"name": "info.md", "path": "info.md"},
        {"name": "verify.py", "path": "verify.py"},
    ]


def test_docs_md_surfaced(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "docs").mkdir()
    (module_dir / "docs" / "guide.md").write_text("# guide")
    (module_dir / "docs" / "ignored.txt").write_text("nope")
    assert list_module_files("linear", MANAGED, clone_dir=tmp_path) == [
        {"name": "info.md", "path": "info.md"},
        {"name": "guide.md", "path": "docs/guide.md"},
    ]


def test_scripts_py_surfaced(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "scripts").mkdir()
    (module_dir / "scripts" / "a.py").write_text("a")
    (module_dir / "scripts" / "b.py").write_text("b")
    (module_dir / "scripts" / "notes.md").write_text("nope")
    result = list_module_files("linear", MANAGED, clone_dir=tmp_path)
    assert {"name": "a.py", "path": "scripts/a.py"} in result
    assert {"name": "b.py", "path": "scripts/b.py"} in result
    assert {"name": "notes.md", "path": "scripts/notes.md"} not in result


def test_ordering_top_then_docs_then_scripts(tmp_path: Path):
    module_dir = _setup_module(tmp_path, "linear")
    (module_dir / "info.md").write_text("# info")
    (module_dir / "docs").mkdir()
    (module_dir / "docs" / "guide.md").write_text("g")
    (module_dir / "scripts").mkdir()
    (module_dir / "scripts" / "a.py").write_text("a")
    result = list_module_files("linear", MANAGED, clone_dir=tmp_path)
    # Top-level first (info.md), then docs, then scripts.
    assert result == [
        {"name": "info.md", "path": "info.md"},
        {"name": "guide.md", "path": "docs/guide.md"},
        {"name": "a.py", "path": "scripts/a.py"},
    ]
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `uv run pytest tests/test_git_repo_list_module_files.py -v`

Expected: `test_scripts_py_surfaced` and `test_ordering_top_then_docs_then_scripts` fail because `scripts/` is not walked yet. The other three pass.

- [ ] **Step 3: Add `scripts/*.py` walking**

Modify `platform/src/services/git_repo.py`. Extend the `list_module_files` loop so it also walks `scripts/`. Replace the function body (lines 123-142) with:

```python
def list_module_files(
    module: str,
    managed_files: frozenset[str],
    *,
    clone_dir: Path | None = None,
) -> list[dict[str, str]]:
    """List top-level non-managed files + `docs/*.md` + `scripts/*.py` for a module."""
    root = _resolve_clone(clone_dir) / module
    if not root.is_dir():
        raise FileNotFoundError(f"Module '{module}' not found")

    result: list[dict[str, str]] = []
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.name not in managed_files:
            result.append({"name": entry.name, "path": entry.name})
        elif entry.is_dir() and entry.name == "docs":
            for doc in sorted(entry.iterdir()):
                if doc.is_file() and doc.name.endswith(".md"):
                    result.append({"name": doc.name, "path": f"docs/{doc.name}"})
        elif entry.is_dir() and entry.name == "scripts":
            for script in sorted(entry.iterdir()):
                if script.is_file() and script.name.endswith(".py"):
                    result.append({"name": script.name, "path": f"scripts/{script.name}"})
    return result
```

Note: `sorted(root.iterdir())` sorts by name, so `docs` comes before `scripts` alphabetically — the test relies on this.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_git_repo_list_module_files.py -v`

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `uv run pytest -v`

Expected: every test passes.

- [ ] **Step 6: Stage**

```bash
git add platform/src/services/git_repo.py platform/tests/test_git_repo_list_module_files.py
# Commit only if the user has explicitly asked.
```

---

## Task 3: Restructure `_conventions.md` — split §8 into §8 Script Contract + §9 Verify Script

**Rationale:** Both `/add-verify` and `/add-script` share the same universal script rules (`os.environ`, exit codes, `KeyError → 2`). Factor these into a new §8 *Script Contract*; narrow §9 to the read-only/≤5-items specifics of `verify.py`. The section heading "Verify Script" MUST be preserved verbatim — `add_verify.md:24`, `add_verify.md:26`, and `add_integration.md:101` all reference it by name.

**Files:**
- Modify: `platform/src/prompts/_conventions.md` (§5 Module Structure and §8)

No new tests — existing `tests/test_commands.py::test_add_verify_prompt_has_required_shape` implicitly verifies conventions still inject cleanly (no unreplaced `{conventions}` placeholder, "save" and "Run" still present).

- [ ] **Step 1: Update §5 "Module Structure" to mention `scripts/*.py`**

Edit `platform/src/prompts/_conventions.md`. In the §5 bullet list of module folder contents, replace:

```
- `*.py` — optional runnable scripts (e.g. `verify.py` for a read-only smoke test); open the file from the sidebar to preview and hit **Run** to execute under varlock
```

with:

```
- `verify.py` — optional read-only smoke test at module root; open from the sidebar and hit **Run** to execute under varlock
- `scripts/*.py` — optional additional runnable scripts (read or write) for the integration; authored via `/add-script`; open from the sidebar and hit **Run** to execute under varlock
```

- [ ] **Step 2: Replace §8 with two sections: §8 Script Contract + §9 Verify Script**

Edit `platform/src/prompts/_conventions.md`. Replace the entire existing §8 block (from `## 8. Verify Script (\`verify.py\`)` through the end of the "When to skip drafting one" paragraph) with the two-section block below. Keep everything above §8 (sections §1–§7) and the file's trailing newline behavior untouched.

```markdown
## 8. Script Contract

Universal rules for any `.py` file inside a module (`verify.py`, `scripts/*.py`, or any other runnable). Verify scripts inherit these rules and add the read-only specifics in §9.

**Rules:**

- Secrets via `os.environ["VAR"]` — never hardcode, never `load_dotenv`, never write secrets to the script.
- Use only secrets already declared in `module.yaml`. Do not invent new env vars.
- Exit codes: `0` OK, `2` missing secret (`KeyError` on `os.environ[...]`), `1` any other failure.
- Error handling: wrap the body in `try` / `except KeyError` (exit 2, stderr) / `except Exception` (exit 1, stderr).
- Success output: print at least one concrete line to stdout identifying what the script did — e.g. `OK — 5 items: DEMO-7, DEMO-6, DEMO-5`, `Created issue DEMO-42`, `Updated 3 rows`. Multi-line is fine.
- No CLI args, no stdin, no retries unless the task genuinely needs them.

**Generic template:**

```python
import os, sys

try:
    # <do the thing, reading secrets via os.environ["VAR_NAME"]>
    print("OK — <what happened, with concrete values>")
except KeyError as e:
    print(f"MISSING SECRET: {e}", file=sys.stderr)
    sys.exit(2)
except Exception as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
```

**Invocation.** The backend runs any module `.py` via `varlock run -- uv run python modules-repo/<name>/<path>.py` from `platform/src/context/`. Scripts must be standalone Python — no CLI args, no stdin.

## 9. Verify Script (`verify.py`)

A minimal, **read-only** Python script at module root that demonstrates the integration's **real value** — not just that auth works, but that it actually fetches something the user cares about. Inherits all rules from §8 Script Contract; narrowing rules below.

**Good (real value):**

- Linear: list the 5 most recent open issues, print their keys
- Stripe: fetch the 3 most recent customers, print their emails
- Google Sheets: read the first 5 rows of a specific sheet
- Slack: fetch the last 3 messages from a given channel
- Postgres / MySQL: `SELECT id, email FROM users LIMIT 5`

**Not enough (avoid):**

- `GET /me`, `GET /health`, `viewer { id }` — proves auth, shows nothing useful
- Generic "ping" / "who am I" endpoints

**Narrowing rules (on top of §8):**

- **Read-only only.** No POST/PUT/DELETE that creates or modifies data.
- Single-line stdout success with concrete values (e.g. `OK — 2 open issues: DEMO-7, DEMO-6`). Not just `OK`.
- Limit to 3–5 items.
- No pagination.

**Template:**

```python
import os, sys, requests

try:
    r = requests.get(
        "https://api.example.com/v1/items?limit=5",
        headers={"Authorization": os.environ["EXAMPLE_API_KEY"]},
        timeout=5,
    )
    r.raise_for_status()
    items = r.json()["data"]
    names = ", ".join(i["name"] for i in items[:3])
    print(f"OK — {len(items)} items: {names}")
except KeyError as e:
    print(f"MISSING SECRET: {e}", file=sys.stderr)
    sys.exit(2)
except Exception as e:
    print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)
```

**When to skip drafting one.** If the integration has no clear read-only "list something real" operation (e.g. write-only webhooks, OAuth flows requiring interactive token refresh), skip the draft and suggest `/add-verify` for later.
```

Note the section heading `## 9. Verify Script (\`verify.py\`)` is load-bearing — `add_verify.md` and `add_integration.md` refer to the "Verify Script section in Conventions" by this name.

- [ ] **Step 3: Run the test suite to verify no regressions**

Run: `uv run pytest -v`

Expected: every test passes, in particular `tests/test_commands.py::test_add_verify_prompt_has_required_shape` (verifies `{conventions}` still injects cleanly, "save" and "Run" still present in the rendered `/add-verify` prompt).

- [ ] **Step 4: Sanity-read the rendered `/add-verify` prompt**

Run (from `platform/`): `uv run python -c "from src.commands import COMMANDS; p = next(c for c in COMMANDS if c.name == 'add-verify').prompt; print(p)" | head -200`

Expected: the rendered prompt contains both `## 8. Script Contract` and `## 9. Verify Script (\`verify.py\`)` headings, and no `{conventions}` literal.

- [ ] **Step 5: Stage**

```bash
git add platform/src/prompts/_conventions.md
# Commit only if the user has explicitly asked.
```

---

## Task 4: Create the `/add-script` prompt file

**Rationale:** The prompt is the command logic: a phase table driving the conversation, then a HOW-THIS-WORKS / SAVING / CONVENTIONS layout that matches `add_verify.md` so the two commands feel consistent.

**Files:**
- Create: `platform/src/prompts/commands/add_script.md`

This task has no unit test of its own — Task 5's registration test will verify the prompt loads and injects correctly.

- [ ] **Step 1: Create the prompt file**

Create `platform/src/prompts/commands/add_script.md` with the following content:

````markdown
# /add-script

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1. Name check | user runs `/add-script` | If no module name, ask which module. If module dir doesn't exist, tell the user and stop — do not create the module. | Wait for name |
| 2. Intent check | name provided | Read `info.md` + `module.yaml`. If purpose was given inline, go to draft. If not, surface a menu of 5–8 plausible scripts drawn from `info.md`'s operations + an "other (describe it)" option. | Wait for choice or custom purpose |
| 3. Draft | intent clear | Slug the purpose into a filename (`create-issue.py`, `list-projects.py`). On collision with an existing `scripts/<slug>.py`, append `-2`/`-3` or ask. Draft per the Script Contract below. Show the draft with a header comment `# scripts/<slug>.py — <one-line purpose>`. | "Look good? Say **save**, tell me what to change, or rename the file." |
| 4. Revision | user requests changes | Update draft (content or filename), re-show | Same prompt |
| 5. Save | user says "save" | Write `verify.py`-style to `modules-repo/<name>/scripts/<slug>.py` | "Saved. Open it from the `<name>` module in the sidebar and hit **Run**." |

You are a conversational assistant helping the user add a general-purpose Python script to an existing context module.

The user invoked `/add-script`. The argument after the command is the module name. Any further text is a free-form description of what the script should do.

IMPORTANT: If no module name was given, ask: "Which module do you want to add a script to?" and STOP.

IMPORTANT: If the module directory does not exist under `modules-repo/<name>/`, tell the user clearly and STOP. Do not create the module — `/add-script` only adds scripts to modules that already exist.

IMPORTANT: If the user's purpose is a read-only listing smoke test (e.g. "list the 5 most recent X", "show me my Y"), suggest they use `/add-verify` instead (which produces `verify.py` at module root with a dedicated contract). If they still want a scripts/ entry, continue with `/add-script`.

═══════════════════════════════════════════════════════════════
HOW THIS WORKS
═══════════════════════════════════════════════════════════════

1. Read `modules-repo/<name>/info.md` and `modules-repo/<name>/module.yaml`.
2. Determine intent:
   - If the user gave a free-form purpose after the module name, use that directly.
   - If not, surface a short menu (5–8 items) of plausible scripts for this integration, drawn from the operations listed in `info.md`. Include an "other (describe it)" option.
3. Slug the purpose into a filename under `scripts/`. Examples: "create a new issue in project FOO" → `scripts/create-issue.py`; "list all active customers" → `scripts/list-active-customers.py`. If `scripts/<slug>.py` already exists, append `-2`, `-3`, etc., or ask the user to rename.
4. Use the `secrets:` from `module.yaml` — never invent new env vars. If the drafted script needs a secret that is not declared in `module.yaml`, surface this and ask the user to add it to `module.yaml` before continuing.
5. Draft `<slug>.py` following the **Script Contract** in Conventions below. Show it with a header comment `# scripts/<slug>.py — <one-line purpose>`. Iterate on user feedback — they can ask for code changes or say "call it `<new>.py` instead" to rename.
6. On `save`, write the file.

The universal script contract (secrets, exit codes, error handling, success output) lives in the **Script Contract** section under Conventions below. Follow it exactly.

═══════════════════════════════════════════════════════════════
SAVING
═══════════════════════════════════════════════════════════════

When the user says `save`:

1. Write the full draft to `modules-repo/<name>/scripts/<slug>.py` using the Write tool. Create the `scripts/` directory if it does not exist.
2. Tell the user: "Saved. Open `scripts/<slug>.py` from the `<name>` module in the sidebar and hit **Run**."

Do NOT emit a TRY marker. Do NOT suggest a slash command. The sidebar file preview's **Run** button is the only intended trigger.

═══════════════════════════════════════════════════════════════
CONVENTIONS
═══════════════════════════════════════════════════════════════

{conventions}
````

- [ ] **Step 2: Verify the file was written**

Run: `uv run pytest -v` (existing suite should still pass — no new tests yet, no code wired to this file yet).

Expected: suite passes. The new prompt file exists on disk but isn't loaded by anything until Task 5.

- [ ] **Step 3: Stage**

```bash
git add platform/src/prompts/commands/add_script.md
# Commit only if the user has explicitly asked.
```

---

## Task 5: Register `/add-script` in the command registry

**Rationale:** Exposes the command to the `/api/commands` endpoint so it appears in the SlashCommandSelector dropdown.

**Files:**
- Modify: `platform/src/commands.py:51-82` (the `COMMANDS` list)
- Test: `platform/tests/test_add_script.py` (new file)

- [ ] **Step 1: Write the failing test**

Create `platform/tests/test_add_script.py`:

```python
"""Smoke tests for the /add-script slash command registration."""
from src.commands import COMMANDS


def test_add_script_is_registered():
    """/add-script should be in the static COMMANDS list."""
    names = [c.name for c in COMMANDS]
    assert "add-script" in names


def test_add_script_prompt_has_required_shape():
    """Prompt should load, reference save behavior + sidebar Run, and have
    conventions injected (both sections 8 and 9)."""
    cmd = next(c for c in COMMANDS if c.name == "add-script")
    assert cmd.description  # non-empty
    assert "save" in cmd.prompt.lower()
    assert "Run" in cmd.prompt  # references the file-preview Run button
    # Conventions must have been injected (no unreplaced placeholder).
    assert "{conventions}" not in cmd.prompt
    # The Script Contract section (§8) must be present after injection.
    assert "Script Contract" in cmd.prompt
    # The prompt routes read-only intents to /add-verify.
    assert "/add-verify" in cmd.prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_add_script.py -v`

Expected: both tests fail with `StopIteration` / `AssertionError` because `/add-script` is not yet in `COMMANDS`.

- [ ] **Step 3: Register the command**

Modify `platform/src/commands.py`. Append this entry to the `COMMANDS` list (after the existing `add-verify` entry, before the closing `]`):

```python
    CommandDef(
        name="add-script",
        description="Add a Python script (read or write) to an existing module's scripts/",
        prompt=_load_prompt("commands/add_script.md", inject_conventions=True),
    ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_add_script.py -v`

Expected: both tests pass.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `uv run pytest -v`

Expected: every test passes — in particular `tests/test_commands.py::test_add_verify_is_registered` and `tests/test_commands.py::test_add_verify_prompt_has_required_shape` still pass (unaffected).

- [ ] **Step 6: Stage**

```bash
git add platform/src/commands.py platform/tests/test_add_script.py
# Commit only if the user has explicitly asked.
```

---

## Task 6: Manual end-to-end verification

**Rationale:** The command is UI-driven. Unit tests verify the backend and registration; only a live run verifies the conversational flow, the sidebar rendering, and the Run-under-varlock path.

**Files:** none modified (manual inspection only).

- [ ] **Step 1: Start the dev server**

From `platform/`:

```bash
uv run start
```

Note: if the server is already running, skip this step. From CLAUDE.md: "For UI or frontend changes, start the dev server and use the feature in a browser."

- [ ] **Step 2: Verify `/add-script` appears in the slash-command selector**

In the chat UI, type `/` — the dropdown should list `add-script` alongside the other commands with the description "Add a Python script (read or write) to an existing module's scripts/".

- [ ] **Step 3: Run the happy path against an existing module**

Type `/add-script linear list open issues`. Expected flow:

1. Agent reads `info.md` + `module.yaml`.
2. Agent drafts `scripts/list-open-issues.py` using `LINEAR_API_KEY`.
3. The drafted script follows §8 Script Contract — `try` / `except KeyError: exit 2` / `except Exception: exit 1`, `os.environ` for secrets, prints a concrete success line.
4. User says `save`.
5. File appears at `modules-repo/linear/scripts/list-open-issues.py`.
6. Sidebar's linear card refreshes and shows `scripts/list-open-issues.py` in its SCRIPTS section (alongside `verify.py` if present).
7. Clicking the file opens `FilePreviewModal`; hitting **Run** executes `varlock run -- uv run python modules-repo/linear/scripts/list-open-issues.py` from `platform/src/context/` and prints the output in the modal.

- [ ] **Step 4: Run the menu path**

Type `/add-script linear` (no purpose). Expected: the agent offers a menu of 5–8 plausible scripts from `info.md`'s operations + an "other (describe it)" option. Pick one; the flow continues from Draft.

- [ ] **Step 5: Run the error path — missing module**

Type `/add-script nonexistent-module do something`. Expected: the agent reports the module doesn't exist and stops. No directory is created under `modules-repo/`.

- [ ] **Step 6: Run the collision path**

Type `/add-script linear list open issues` a second time. Expected: either the agent auto-increments to `scripts/list-open-issues-2.py`, or it surfaces the collision and asks to rename. Either is acceptable — both are specified in Task 5's prompt.

- [ ] **Step 7: Verify `/add-verify` still works**

Type `/add-verify stripe` (or another integration without a `verify.py`). Expected: the command runs end-to-end with no regression — the prompt still references the "Verify Script section in Conventions" and the draft follows §9.

- [ ] **Step 8: Verify `/add-script` deflects read-only intent**

Type `/add-script linear show me the 5 most recent open issues`. Expected: the agent suggests using `/add-verify` instead (because the purpose is a classic read-only listing). If the user insists, the command continues.

- [ ] **Step 9: Stage any accidentally modified files**

```bash
git status
# If nothing is modified beyond the previously-staged tasks, this step is a no-op.
```

---

## Out of Scope (not in this plan)

- Visual grouping or a collapsible file tree in the sidebar (current partition is already docs vs scripts).
- Stripping the `scripts/` prefix from the sidebar label.
- Per-script metadata (tags, mutation flags, last-run time, schedules).
- Deleting/renaming scripts from the UI.
- Consolidating `list_workspace_files` and `list_module_files` into a single helper (noted as a future follow-up in the spec).
- Automated end-to-end tests of the conversational flow.
