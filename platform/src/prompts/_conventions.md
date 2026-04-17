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
