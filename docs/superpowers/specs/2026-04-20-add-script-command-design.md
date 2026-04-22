# /add-script — general Python script authoring per module

## Problem

`/add-verify` creates one opinionated, read-only smoke test per module (`verify.py` at module root). Users want a more general capability: author arbitrary Python scripts against a loaded module's API — list operations, mutations, one-off data pulls, Postman-style request collections — while reusing the same secret plumbing (`varlock run -- uv run python …`) and the sidebar's Run button. Scripts live in `modules-repo/<name>/scripts/` and accumulate per module.

## Goals

- One command, `/add-script`, that scaffolds an arbitrary-purpose Python script inside an existing module's `scripts/` directory.
- Reuse existing infrastructure: varlock secret injection, the `/api/modules/{name}/files/{path}/run` endpoint, the sidebar file preview + Run button.
- Factor the shared script rules (secrets via `os.environ`, exit codes, error handling) out of the verify-specific section of `_conventions.md` so both commands reference one source of truth.
- Keep `/add-verify` intact — verify remains a distinct, opinionated first-run smoke test at module root.

## Non-goals

- Visual grouping or a collapsible folder tree in the sidebar.
- Per-script metadata (tags, "mutates data" flags, last-run times, schedules).
- Deleting or renaming scripts from the UI (file system / git handle this for now).
- Automated tests for the command flow itself (manual verification only).
- Extra ceremony around mutation scripts (confirmation modals, dry-run mode). The draft review step before save is the safety gate.

## Design

### Command shape

`/add-script <module> [purpose...]`

- First arg: module name (required).
- Remaining args: free-form purpose (optional). If omitted, the agent surfaces a menu.

### Flow

Mirrors `/add-verify`'s five-phase table. The phases change where noted.

| Phase | Trigger | Agent does | Ends with |
|---|---|---|---|
| 1. Name check | user runs `/add-script` | If no name, ask which module. If module dir doesn't exist under `modules-repo/<name>/`, tell user and stop — do not create the module. | Wait for name |
| 2. Intent check | name provided | Read `info.md` + `module.yaml`. If purpose was given inline, proceed to draft. If not, surface a menu of 5–8 plausible scripts drawn from `info.md`'s operations + an "other (describe it)" option. | Wait for user choice or custom purpose |
| 3. Draft | intent clear | Slug the purpose into a filename (`create-issue.py`, `list-projects.py`). On collision with an existing `scripts/<slug>.py`, append `-2` (or higher) or ask. Draft per §8 Script Contract. Show the draft with header comment `# scripts/<slug>.py — <one-line purpose>`. | "Look good? Say **save**, tell me what to change, or rename the file." |
| 4. Revision | user requests changes | Update draft (content or filename), re-show. | Same prompt as phase 3 |
| 5. Save | user says "save" | Write to `modules-repo/<name>/scripts/<slug>.py`. | "Saved. Open it from the `<name>` module in the sidebar and hit **Run**." |

Do not emit a TRY marker. Do not suggest a slash command. The sidebar Run button is the only intended trigger, same as `/add-verify`.

### Scope of supported scripts

Any operation, read or write. Mutation scripts are first-class — no extra confirmation layer, no dry-run mode, no UI warning. The draft header line (`# scripts/create-issue.py — creates a new Linear issue`) is the intent signal. The user is reviewing the full script before save, which is the safety gate.

### Filename

Agent generates a slug from the purpose and puts it in the draft header so it is visible and revisable during the draft/revision loop. Collisions append `-2`, `-3`, etc.; the agent may also ask. The user can rename at any draft turn by saying "call it `new-issue.py` instead".

### Conventions restructure (`platform/src/prompts/_conventions.md`)

The current §8 "Verify Script" section conflates universal script rules with verify-specific rules. Split into two sections:

**§8 — Script Contract (applies to any `.py` in a module).**

- Secrets: read from `os.environ["VAR"]`. Never hardcode, never `load_dotenv`, never write secrets to the script. Use only secrets declared in `module.yaml`; do not invent new env vars.
- Exit codes: `0` OK; `2` missing secret (`KeyError` on `os.environ[...]`); `1` any other failure.
- Error handling: wrap in `try` / `except KeyError` (exit 2, stderr) / `except Exception` (exit 1, stderr).
- Success output: print at least one concrete line to stdout identifying what the script did (e.g. `OK — 5 items: ...`, `Created issue DEMO-42`, `Updated 3 rows`). Multi-line is fine.
- No CLI args, no stdin, no retries unless the task genuinely needs them.
- Invocation: backend runs via `varlock run -- uv run python modules-repo/<name>/<path>.py` from `platform/src/context/`.
- Generic try/except template lives here.

**§9 — Verify Script (`verify.py`, read-only).**

Narrows §8 with the read-only specifics:

- Read-only only. No POST/PUT/DELETE that creates or modifies data.
- "List something real" rule — must return real data the user cares about, not `/me` or `/health`.
- ≤5 items, single-line stdout with concrete values (e.g. `OK — 2 open issues: DEMO-7, DEMO-6`).
- Good / not-enough examples stay here.
- Concrete read-only template stays here.

**Section name is load-bearing.** The new §9 MUST be titled exactly `Verify Script`. Two existing prompts reference this section by name (not number):
- `platform/src/prompts/commands/add_verify.md:24` and `:26` — "Verify Script section in Conventions"
- `platform/src/prompts/commands/add_integration.md:101` — "**Verify Script** section in Conventions"

Preserving the name keeps these references valid with no prompt-text changes. If the planner chooses a different §9 heading, both prompts must be updated in the same change.

**§5 — Module Structure.** Add `scripts/*.py` as a recognized subdirectory alongside `docs/*.md`.

### Prompt file

New `platform/src/prompts/commands/add_script.md` follows the `/add-verify` structure: phase table → HOW THIS WORKS → SAVING → `{conventions}` placeholder. References §8 (Script Contract). If the user describes a read-only listing intent during phase 2, the agent should surface `/add-verify` as a better fit and stop.

### Command registration

New entry in `platform/src/commands.py` registering `/add-script` with the new prompt file. No other changes to the command registry.

### Backend: file listing (two functions, both must change)

There are **two** file-listing helpers, each feeding a different view:

- **`list_workspace_files`** at `platform/src/services/workspace_inspect.py:11` — called by `GET /api/workspace`, which populates `loaded.files` on each integration card. **This is what drives the main sidebar — the place the user actually clicks files and hits Run. This is the primary change.**
- **`list_module_files`** at `platform/src/services/git_repo.py:123` — called by `GET /api/modules/{name}/files`, which feeds the ModuleEditor's own sidebar (a different view from the main sidebar).

Both currently walk top-level files + `docs/*.md`. Both must also walk `scripts/*.py` for the new command to work end-to-end in both views. Extend each with the equivalent of:

```python
# list_workspace_files (returns list[str]):
scripts = module_dir / "scripts"
if scripts.is_dir():
    for script in sorted(scripts.iterdir()):
        if script.is_file() and script.name.endswith(".py"):
            paths.append(f"scripts/{script.name}")

# list_module_files (returns list[dict]):
elif entry.is_dir() and entry.name == "scripts":
    for script in sorted(entry.iterdir()):
        if script.is_file() and script.name.endswith(".py"):
            result.append({"name": script.name, "path": f"scripts/{script.name}"})
```

Returned paths include the `scripts/` prefix. Since `reload_workspace` symlinks the entire module dir into `context/`, the `scripts/` folder appears in the workspace copy automatically — no additional plumbing for the symlink side.

**Optional consolidation (nice-to-have, not required).** The two helpers duplicate logic. A planner may choose to merge them into one shared helper used by both callers, but this is orthogonal to shipping the feature.

### Frontend: sidebar rendering

`IntegrationCard.tsx:83–84` already partitions `loaded.files` into `docFiles` (non-`.py`) and `scriptFiles` (`.py`) and renders them in separate sections. New files at `scripts/create-issue.py` land in the existing SCRIPTS section alongside `verify.py`. **No frontend change required.**

The display label comes from the `path` string verbatim, so the Scripts section will show:
```
verify.py
scripts/create-issue.py
scripts/list-projects.py
```

This is acceptable: the `scripts/` prefix is informative (distinguishes root `verify.py` from scripts-dir files) and matches how `docs/*.md` already renders today. If the visual redundancy becomes bothersome later, a small tweak in `IntegrationCard` to strip the `scripts/` prefix when rendering is a trivial follow-up — but not in scope here.

### Backend: run endpoint

No change required. `api_run_module_file` at `platform/src/routes/modules.py:203` uses a `{file_path:path}` route param, so `scripts/foo.py` passes through; `validate_module_file_path` at `platform/src/services/schemas.py:17` allows subpaths (only `..` is blocked, `.py` extension is allowed); execution already runs under varlock from `platform/src/context/`. `scripts/create-issue.py` works as-is.

## Data flow (happy path)

1. User runs `/add-script linear create an issue in project FOO`.
2. Agent reads `modules-repo/linear/info.md` and `modules-repo/linear/module.yaml`.
3. Agent slugs the purpose to `create-issue` and drafts `scripts/create-issue.py` per §8 Script Contract, using `LINEAR_API_KEY` from the module's declared secrets.
4. Agent shows the draft with header `# scripts/create-issue.py — creates a new issue in project FOO`.
5. User says "save".
6. Agent writes `modules-repo/linear/scripts/create-issue.py`.
7. Backend `list_workspace_files` (main sidebar feed) and `list_module_files` (ModuleEditor feed) both include `scripts/create-issue.py` in their returned paths.
8. `IntegrationCard` renders the new file in its existing SCRIPTS section alongside `verify.py`.
9. User clicks the file, hits Run, backend executes `varlock run -- uv run python modules-repo/linear/scripts/create-issue.py` from `platform/src/context/`.

## Error handling and edge cases

- **No module name.** Agent asks which module.
- **Module doesn't exist.** Agent tells the user and stops. `/add-script` does not create modules, same rule as `/add-verify`.
- **Filename collision.** Append `-2`, `-3`, … or ask the user to rename.
- **Read-only intent.** If phase 2 turns up a classic read-only listing purpose, the agent suggests `/add-verify` instead (single-line output, ≤5 items, dedicated module-root slot), then stops. User can override.
- **Undeclared secret.** Script must use only secrets in `module.yaml`. If the drafted script needs one that isn't declared, the agent surfaces this and asks the user to add it to `module.yaml` via the edit flow before continuing.
- **Missing secret at runtime.** Script raises `KeyError` → exits 2. Sidebar surfaces the stderr line.

## Manual verification plan

After implementation, verify against an existing module (e.g. `linear`):

1. Run `/add-script linear list open issues` — expect a drafted `scripts/list-open-issues.py`.
2. Say "save" — expect the file at `modules-repo/linear/scripts/list-open-issues.py`.
3. Reload the sidebar — expect `scripts/list-open-issues.py` in the linear module card's file list.
4. Click the file, hit Run — expect non-zero exit 2 if the secret is missing, exit 0 with a printed success line otherwise.
5. Run `/add-script linear` with no purpose — expect a menu of 5–8 suggested scripts drawn from `info.md`.
6. Run `/add-script nonexistent-module foo` — expect an error message and stop, no directory created.
7. Run `/add-script linear list open issues` a second time — expect either an auto-incremented `list-open-issues-2.py` or a prompt to rename.
8. Confirm `/add-verify linear` still works end-to-end and writes `verify.py` to module root (no regression from §8/§9 split).

## Open questions

None currently.
