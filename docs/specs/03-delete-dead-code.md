# Spec 03 — Delete dead `sessions.py` files

## Goal

Remove two dead files left over from the migration to `claude_sessions.py`.

## Answer driving this spec

Confirmed safe to delete both.

## Files to delete

- `platform/src/services/sessions.py` — 0 bytes.
- `platform/src/services/sessions.py.bak` — 1 line.

## Verification before deleting

Confirm no imports (already verified once; re-run before removing):

```sh
grep -rn "from src.services.sessions\|from src.services import sessions\b" platform/src platform/tests
```

Expected: no matches.

## Implementation steps

1. Run the grep above; proceed only if empty.
2. Delete both files.
3. Delete any stale `__pycache__` entries:
   - `platform/src/services/__pycache__/sessions.*.pyc` if present.
4. Run `uv run pytest` to confirm nothing was secretly relying on them.

## Acceptance

- `find platform/src/services -name "sessions*"` returns only `claude_sessions.py`.
- Tests pass.

## Estimated effort

5 minutes.
