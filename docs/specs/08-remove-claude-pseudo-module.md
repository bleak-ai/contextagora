# Spec 08 — Remove the `.claude` pseudo-module

## Goal

Kill the `.claude/` symlink preservation code path and any remaining on-disk `.claude/commands/*.md` plumbing. All slash-command prompts already live as markdown files in `platform/src/prompts/commands/` and are intercepted by the backend — the `.claude/` dance is vestigial.

## Answer driving this spec

- Not platform-owned, not user-owned — **shouldn't be used at all, should be deprecated**.
- `.claude/commands/download.md` — **no, it shouldn't exist**.

## Current state

- `platform/src/services/workspace.py:15` declares `PRESERVED_DIRS = [".claude"]`.
- `reload_workspace` symlinks `.claude` from `modules-repo/.claude` into `context/.claude` when present (lines 51-57).
- `platform/src/context/.claude/` does **not** exist on disk (verified).
- `DECISIONS.md` § "Static files baked into Docker image, not generated at startup" references `.claude/commands/download.md`.
- `Dockerfile` may or may not copy `.claude` — to verify during implementation.

## Target state

- `.claude/` never appears in `context/`.
- No code path symlinks, copies, or preserves it.
- Slash command prompts flow **only** through `src/prompts/commands/*.md` → `commands.py` → `routes/chat.py::_expand_slash_command`.
- Docs reflect the new reality.

## Implementation steps

### 1. Code removal

1. In `platform/src/services/workspace.py`:
   - Delete the constant `PRESERVED_DIRS = [".claude"]`.
   - Delete the "Link preserved dirs" block (lines 51-57).
   - In the `available` set construction, drop `| set(PRESERVED_DIRS)`.
2. Grep for any other `.claude` references:
   ```sh
   grep -rn "\.claude" platform/src --include="*.py"
   ```
   Remove or adjust each hit. Likely candidates: `Dockerfile`, any `COPY` lines bringing in `.claude/`.

### 2. Docker cleanup

3. Inspect `platform/Dockerfile` for any `COPY platform/src/context/.claude ...` or similar.
   - Remove it.
4. Inspect `platform/.dockerignore` for `.claude` entries — remove them too if they exist (they're moot once the folder is gone).

### 3. Filesystem cleanup

5. If `platform/src/context/.claude/` exists in the repo (it currently does **not**, per verification), delete it in a follow-up commit. Tracked here for completeness.

### 4. Docs

6. In `DECISIONS.md`, locate the decision **"Static files baked into Docker image, not generated at startup"** and add a **Superseded** note:
   > **Superseded:** `.claude/commands/*.md` no longer exists on disk. Slash commands are loaded from `platform/src/prompts/commands/*.md` by `commands.py` and intercepted by the backend before reaching the `claude` subprocess — they never materialize into the CLI's command directory. The original decision applied to a short-lived dual-source layout that was removed.
7. In `STATUS.md` § Chat, the line *"Commands are intercepted by the backend, which substitutes their prompt text from `src/prompts/commands/*.md` before reaching the Claude subprocess"* is already correct. No edit needed; re-read to confirm.

### 5. Verification

8. `uv run pytest` — must pass.
9. Start the server, load a module, run `/download` in chat — should work end-to-end (backend interception path).
10. `find platform/src -name ".claude" -type d` — expect no results.

## Acceptance

- `grep -rn "PRESERVED_DIRS\|\.claude" platform/src` returns no matches.
- `DECISIONS.md` has the Superseded note.
- `/download` and every other slash command still work in the UI.
- No orphaned Docker `COPY` lines.

## Out of scope

- Reworking the slash-command interception model itself.
- Providing a `.claude/commands/` directory for users who run the bare Claude CLI outside the web UI (explicitly declined by user answer).
