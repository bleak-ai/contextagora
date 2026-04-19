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

- `info.md` — integration description, entities, operations, examples
- `module.yaml` — declares `secrets:` and `dependencies:`
- `docs/*.md` — optional supplementary documentation
- `*.py` — optional runnable scripts (e.g. `verify.py` for a read-only smoke test); open the file from the sidebar to preview and hit **Run** to execute under varlock

## 6. Python Packages

Declared in `module.yaml` under `dependencies:`, one per entry, no versions unless a specific version is required. Packages are pre-installed by the host. The `info.md` may list packages for documentation, but `module.yaml` is the authoritative source.

## 7. Saving a Module

To save a new or updated module:

1. Write `info.md` to `modules-repo/<name>/info.md` using the Write tool
2. Write `module.yaml` to `modules-repo/<name>/module.yaml`
3. Register: `curl -sS -X POST {base_url}/api/modules/<name>/register`

### module.yaml fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | folder-safe slug |
| `kind` | yes | `integration`, `task` |
| `summary` | yes | one-sentence description |
| `secrets` | if any | env var names needed to connect |
| `dependencies` | if any | Python packages needed |

Only include fields that apply. Examples:

Integration:

```yaml
name: stripe
kind: integration
summary: Stripe billing API for SaaS subscriptions
secrets:
  - STRIPE_KEY_RO
dependencies:
  - stripe
```

Task:

```yaml
name: fix-billing-bug
kind: task
summary: Fix double-charge on plan upgrades
```

## 8. Verify Script (`verify.py`)

A minimal, **read-only** Python script that demonstrates the integration's **real value** — not just that auth works, but that it actually fetches something the user cares about.

**Good (real value):**

- Linear: list the 5 most recent open issues, print their keys
- Stripe: fetch the 3 most recent customers, print their emails
- Google Sheets: read the first 5 rows of a specific sheet
- Slack: fetch the last 3 messages from a given channel
- Postgres / MySQL: `SELECT id, email FROM users LIMIT 5`

**Not enough (avoid):**

- `GET /me`, `GET /health`, `viewer { id }` — proves auth, shows nothing useful
- Generic "ping" / "who am I" endpoints

**Rules:**

- **Read-only only.** No POST/PUT/DELETE that creates or modifies data.
- Secrets via `os.environ["VAR"]` — never hardcode, never `load_dotenv`, never write secrets to the script.
- Use secrets already declared in `module.yaml`. Do not invent new env vars.
- Print a single-line success message with **concrete values** (e.g. `OK — 2 open issues: DEMO-7, DEMO-6`). Not just `OK`.
- Failures go to stderr with non-zero exit.
- Exit codes: `0` OK, `2` missing secret (`KeyError` on `os.environ[...]`), `1` any other failure.
- No retries, no pagination, no CLI args, no stdin, no extra features. Limit to 3–5 items.

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

**Invocation.** The backend runs it via `varlock run -- uv run python modules-repo/<name>/verify.py` from `platform/src/context/`. Must be standalone Python — no CLI args, no stdin.

**When to skip drafting one.** If the integration has no clear read-only "list something real" operation (e.g. write-only webhooks, OAuth flows requiring interactive token refresh), skip the draft and suggest `/add-verify` for later.
