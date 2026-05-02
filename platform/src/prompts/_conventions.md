# Shared Conventions

> **Single source of truth.** All execution, formatting, and structural conventions live here.
> When a convention changes, update THIS file — individual prompts reference it automatically.

---

## 1. Varlock Execution Convention

Every runnable Python snippet MUST be wrapped as:

```
varlock run -- sh -c 'uv run python -c "
<python code that reads secrets from os.environ>
"'
```

Rules:

- No bare `python`. No `load_dotenv()`. No hardcoded secrets. No `--with` flags on `uv` (deps are pre-installed).
- Read secrets from `os.environ["VAR_NAME"]`.
- Escape inner double quotes as `\"` in the heredoc.
- Shell-only examples use: `varlock run -- sh -c '<command using $VAR>'`
- Always use `sh -c '...'` so `$VAR` expands AFTER varlock injects.

## 2. File-Based Credentials

Varlock injects string VALUES, not files. File-based credentials must be converted to string secrets.

- Naming convention: `<SERVICE>_SA_JSON` or `<SERVICE>_KEY_PEM`
- Never use `GOOGLE_APPLICATION_CREDENTIALS` or any file-path variable.
- Parse inline in examples:

```python
import os, json
from google.oauth2 import service_account
creds = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["GCP_SA_JSON"])
)
```

## 3. Secret Handling

- List ENVIRONMENT VARIABLE NAMES ONLY in "Auth & access" sections. Never paste actual values.
- Secrets are stored in Infisical at path `/<module_name>/<SECRET_KEY>` (e.g. `/linear/LINEAR_API_KEY`). Each secret is its own entry inside the module's folder.

## 4. TRY Marker Syntax

```
<<TRY: Show me the 5 most recent issues from Linear>>
```

- Each marker on its own line. No code fence, no quotes around the marker.
- Use real operations only, not generic placeholders.
- Place markers only after a successful save or when listing suggestions.
- Do not explain TRY markers to the user — they render as clickable buttons.

## 5. Module Structure

A context module folder contains:

- `module.yaml` (required) — declares `name`, `kind`, optional `secrets`, optional `dependencies`, optional `jobs`. No `summary`, no `archived`, no workflow-specific fields.
- `llms.txt` (required) — agent's entry point. Starts with `# <name>` and a `> <one-line summary>`. Lists files and directories with one-line descriptions.
- `info.md` (optional, conventional) — long-form documentation: purpose, entities, operations, examples.
- `verify.py` (optional) — read-only smoke test at module root; runnable from the sidebar.
- `scripts/*.py`, `docs/*.md`, growth-area subdirectories — any other content the module needs.

The summary is the `> line` of `llms.txt`. The system reads it from there; do not duplicate it elsewhere.

## 6. Python Packages

Declared in `module.yaml` under `dependencies:`, one per entry, no versions unless a specific version is required. Packages are pre-installed by the host. The `info.md` may list packages for documentation, but `module.yaml` is the authoritative source.

## 7. Saving a Module

Module files live at the absolute path `{modules_repo}/<name>/`. ALWAYS use that absolute path in Write/Bash tool calls — never a relative `modules-repo/<name>/...`, which would resolve under the current cwd and end up in the wrong place.

To save a new or updated module, write the files directly:

1. Write `info.md` (optional) to `{modules_repo}/<name>/info.md` using the Write tool.
2. Write `module.yaml` to `{modules_repo}/<name>/module.yaml`.
3. Write `llms.txt` to `{modules_repo}/<name>/llms.txt` with `# <name>`, `> <summary>`, and a list of files.

No registration step. The server picks up the new folder on the next listing call.

### module.yaml fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | folder-safe slug, must match the directory name |
| `kind` | yes | `integration`, `task`, or `workflow` (tag only; no behavioral effect beyond a sidebar badge) |
| `secrets` | if any | env var names needed to connect |
| `dependencies` | if any | Python packages needed |
| `jobs` | if any | scheduled scripts (see jobs documentation) |

Example integration:

```yaml
name: stripe
kind: integration
secrets:
  - STRIPE_KEY_RO
dependencies:
  - stripe
```

Example task:

```yaml
name: fix-billing-bug
kind: task
```

## 8. Script Contract

Universal rules for any `.py` file inside a module (`verify.py`, `scripts/*.py`, or any other runnable). Verify scripts inherit these rules and add the read-only specifics in §9.

**Rules:**

- Secrets via `os.environ["VAR"]` — never hardcode, never `load_dotenv`, never write secrets to the script.
- Use only secrets already declared in `module.yaml`. Do not invent new env vars.
- Exit codes: `0` OK, `2` missing secret (`KeyError` on `os.environ[...]`), `1` any other failure.
- Error handling: wrap the body in `try` / `except KeyError` (exit 2, stderr) / `except Exception` (exit 1, stderr).
- Success output: print at least one concrete line to stdout identifying what the script did — e.g. `OK — 5 items: DEMO-7, DEMO-6, DEMO-5`, `Created issue DEMO-42`, `Updated 3 rows`. Multi-line output is permitted.
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

**Invocation.** The backend runs any module `.py` via `varlock run -- uv run python {modules_repo}/<name>/<path>.py` from `platform/src/context/`. Scripts must be standalone Python — no CLI args, no stdin.

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

## 10. Where to write

When writing a new file inside a module, first read the module's `llms.txt`. If it has a `## Where to write` section, follow it: use the declared path, naming pattern, and template. Do not invent a new location. Each line in the section reads as `<name> -> <path-with-pattern> (template: <template-path>)`. Read the template, fill it in, and write the entry at the path with the chosen pattern (replacing `<date-slug>`, `<seq>-<slug>`, etc. as appropriate). If the module has no `## Where to write` section, fall back to writing in the module root and append a new line to the section list in `llms.txt` to keep the entry navigable.
