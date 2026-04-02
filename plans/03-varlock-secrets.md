# Plan: Varlock Secrets (Basic, No Infisical)

## Goal

Add per-module secret management using Varlock's `.env.schema` format. When a module is loaded, its secrets get injected. The agent sees the schema (knows what secrets exist) but never sees actual values.

## What changes

1. **Add `.env.schema` files** to sample modules defining what secrets they need

2. **Add `.env` files** (git-ignored) with actual local values for testing

3. **Install varlock** in the Dockerfile

4. **Update the `/load` endpoint** to run `varlock run` per module after copying, which validates and prepares secrets

5. **Add a simple script runner endpoint** — `POST /run` that executes a command wrapped in `varlock run` so secrets are injected at execution time, not stored in the environment

## File changes

```
modules/linear/.env.schema  — declares LINEAR_API_KEY
modules/linear/.env         — local test value (git-ignored)
modules/sqlite/.env.schema  — declares DB_PATH, DB_USER
modules/sqlite/.env         — local test value (git-ignored)
Dockerfile                  — install varlock
app.py                      — validate secrets on load, add /run endpoint
.gitignore                  — ignore .env files
```

## Sample .env.schema (linear)

```bash
# @defaultSensitive=true @defaultRequired=infer
# ---
# @required @sensitive @type=string
LINEAR_API_KEY=
```

## Sample .env (linear, git-ignored)

```
LINEAR_API_KEY=lin_test_abc123
```

## App changes

On `POST /load`:
```python
# After copying module to context
# Validate the schema is satisfied
subprocess.run(["varlock", "check"], cwd=f"context/{module_name}")
```

On `POST /run`:
```python
# Run a command with secrets injected
# e.g. body: {"module": "sqlite", "cmd": "uv run script.py"}
subprocess.run(["varlock", "run", "--", *cmd], cwd=f"context/{module_name}")
```

## How it works

- Agent reads `.env.schema` → knows `LINEAR_API_KEY` exists and is a string
- Agent never sees `.env` values
- When agent needs to run something: `varlock run -- uv run myscript.py`
- Varlock injects secrets into the subprocess environment only

## Verification

1. Add `.env` files with test values
2. Load modules, check that `varlock check` passes (visible in logs)
3. Exec into container: `cd /app/context/linear && varlock run -- env | grep LINEAR`
4. Confirm the secret is injected
5. Confirm `.env` is not visible through FileBrowser or the API

## Out of scope

- Infisical integration (remote secret store)
- Secret rotation
- Per-user secret scoping
