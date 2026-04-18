# Spec 05 — Tests for high-risk streaming / subprocess code

## Status: **DEFERRED**

## Answer driving this spec

"NO tests for now" for all four questions in section 5.

## Why this document exists anyway

When test work is picked up later, this file records what was originally in scope so the work doesn't have to be re-scoped. Do not delete.

## Scope (for when deferred work is picked up)

### Highest risk, lowest effort

- **`services/suggestion_parser.py`** — stateful streaming buffer. A regression silently leaks `<<TRY:` markers into user-visible text.
  - Test: feed the same full string in chunk sizes 1, 2, 3, …, N; assert the extracted suggestions and visible text are invariant under chunking. Hand-written first; `hypothesis` property test as a follow-up if/when it's worth a dev dep.

### Important but more setup

- **`services/workspace.py::reload_workspace`** — filesystem symlink dance.
  - Happy path (2-3 modules, secrets on one).
  - Missing module name → entry in `errors`.
  - Module name with `..` → rejected.
  - Secrets schema file removed when no loaded module has secrets.

- **`services/secrets.py::prune_schema_for_resolved`**
  - All resolved → schema written with all vars.
  - All missing → schema file deleted.
  - Mixed → schema excludes missing, keeps resolved.

### Smoke

- **`routes/chat.py`** — one end-to-end call with a mocked `subprocess.Popen`: assert SSE events are emitted in the expected order for a scripted stream of stream-json lines.

## Deferred decisions

- Hypothesis as a dev dep (yes/no).
- CI gating (when CI exists).
- Mock subprocess vs stub binary on `PATH`.

## Pick-up trigger

Revisit this spec the first time a bug is traced to one of the files above, OR when the codebase stabilizes and the team has bandwidth for baseline coverage.
