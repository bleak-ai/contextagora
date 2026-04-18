# Spec 10 — Retire `validate_modules.py`

## Goal

Delete the orphan 336-line validation script. It has no callers, no CI integration, no Makefile entry, and no documentation — only its own docstring references it.

## Answers driving this spec

- **"can it be removed??? Investigate it."** → Investigated. No callers.
- **"the script should be done in a better way, a script is not the way to handle this"** → Agreed; don't resurrect as a script.
- **"should [run at load time], but not relevant atm"** → Defer any replacement.

## Investigation results

```
$ grep -rn "validate_modules" platform docs Makefile platform/Makefile
platform/src/scripts/__pycache__/validate_modules.cpython-312.pyc   # cached bytecode
platform/src/scripts/validate_modules.py:4                          # self-reference (docstring)
platform/src/scripts/validate_modules.py:5
platform/src/scripts/validate_modules.py:6
```

- No external callers.
- Not in any Makefile, Dockerfile, or CI config.
- Not imported by any module.

## Implementation steps

1. Delete `platform/src/scripts/validate_modules.py`.
2. Delete `platform/src/scripts/__pycache__/` (or let `.gitignore` handle it — check `.gitignore`).
3. Check if `platform/src/scripts/` has any other files:
   ```sh
   ls platform/src/scripts/
   ```
   If only `__pycache__/` remains, delete the entire `scripts/` folder.
4. If `scripts/` is kept, verify there's no `scripts/__init__.py` or other dead entries pointing at the removed script.
5. Search for any stale doc references:
   ```sh
   grep -rn "validate_modules" docs platform README.md
   ```
   Expected: nothing. If any doc mentions it, remove the reference.

## When to bring validation back

When:

- A module is loaded with a malformed `module.yaml` and silently misbehaves, OR
- Multiple users start contributing to the modules-repo and need a pre-merge guardrail.

At that point, don't resurrect the script. Instead:

- Put validation logic in a new `services/validation.py` as pure functions: `validate_module(path: Path) -> list[Issue]`.
- Surface results at **workspace load time** as non-blocking warnings in the sidebar (runs the validators against each loaded module; surfaces issues in the existing load-errors UI).
- Optional: a 20-line `uv run python -m src.services.validation --repo-dir …` CLI shim over the same library, for CI or local lint.

The previous script mixed "what to check" with "how to display results" — the library-first design separates them.

## Acceptance

- `find platform -name "validate_modules*"` returns no results.
- `uv run pytest` still passes (it never depended on the script).
- No stale references in docs.

## Out of scope

- Actually building `services/validation.py`. That's a future spec, triggered by the conditions above.
