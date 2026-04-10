# Module Manifest Migration Guide

> Migrate existing modules from `.env.schema` + `requirements.txt` to `module.yaml`.

## New module structure

```
stripe/
  info.md              # Main documentation (required, unchanged)
  module.yaml          # NEW: declares name, summary, secrets, dependencies
  llms.txt             # Auto-generated navigation (unchanged)
  docs/                # Optional supporting docs (unchanged)
    create-subscription.md
```

### What changed

| Before | After |
|--------|-------|
| `.env.schema` with `VAR_NAME=` lines | `secrets:` list in `module.yaml` |
| `requirements.txt` with package names | `dependencies:` list in `module.yaml` |
| Summary only in `llms.txt` header | `summary:` field in `module.yaml` |

### What `module.yaml` looks like

```yaml
name: stripe
summary: "Stripe payment processing for MAAT SaaS and Marketplace accounts"
secrets:
  - STRIPE_MAAT_SAAS_KEY_RO
  - STRIPE_MAAT_SAAS_KEY_RW
dependencies:
  - stripe
```

All fields except `name` are optional. Empty lists are omitted.

---

## How to migrate

For each module in your modules repo, run these steps.

### 1. Read the current files

```bash
# Check what the module has
cat <module>/.env.schema       # extract secret var names
cat <module>/requirements.txt  # extract package names
head -2 <module>/llms.txt      # extract summary from the > line
```

### 2. Create `module.yaml`

Extract the pieces and write the manifest:

```bash
# Example for the "stripe" module:
cat > stripe/module.yaml << 'EOF'
name: stripe
summary: "Stripe payment processing for MAAT SaaS and Marketplace accounts"
secrets:
  - STRIPE_MAAT_SAAS_KEY_RO
  - STRIPE_MAAT_SAAS_KEY_RW
dependencies:
  - stripe
EOF
```

**How to extract each field:**

- **name**: the directory name
- **summary**: the `> ...` line from `llms.txt` (without the `> ` prefix)
- **secrets**: every non-comment, non-blank line from `.env.schema`, take only the part before `=`
  ```bash
  grep -v '^#' .env.schema | grep '=' | cut -d= -f1
  ```
- **dependencies**: every non-blank line from `requirements.txt`
  ```bash
  grep -v '^$' requirements.txt
  ```

### 3. Delete the old files

```bash
rm <module>/.env.schema
rm <module>/requirements.txt
```

### 4. Commit

```bash
git add -A
git commit -m "migrate: replace .env.schema + requirements.txt with module.yaml"
git push
```

Then pull from the platform UI (Sync > Pull).

---

## Batch migration script

Run from the root of your modules repo to migrate all modules at once:

```bash
for dir in */; do
  name="${dir%/}"
  [ ! -f "$dir/info.md" ] && continue  # skip non-module dirs

  echo "Migrating: $name"

  # Extract summary from llms.txt
  summary=""
  if [ -f "$dir/llms.txt" ]; then
    summary=$(sed -n 's/^> //p' "$dir/llms.txt" | head -1)
  fi

  # Extract secrets from .env.schema
  secrets=""
  if [ -f "$dir/.env.schema" ]; then
    secrets=$(grep -v '^#' "$dir/.env.schema" | grep '=' | cut -d= -f1 | sed 's/^/  - /')
  fi

  # Extract dependencies from requirements.txt
  deps=""
  if [ -f "$dir/requirements.txt" ]; then
    deps=$(grep -v '^$' "$dir/requirements.txt" | sed 's/^/  - /')
  fi

  # Write module.yaml
  {
    echo "name: $name"
    [ -n "$summary" ] && echo "summary: \"$summary\""
    [ -n "$secrets" ] && printf "secrets:\n%s\n" "$secrets"
    [ -n "$deps" ] && printf "dependencies:\n%s\n" "$deps"
  } > "$dir/module.yaml"

  # Remove old files
  rm -f "$dir/.env.schema" "$dir/requirements.txt"
done

echo "Done. Review changes with: git diff"
```

---

## Modules with no secrets or dependencies

If a module has neither, the manifest is just:

```yaml
name: bigquery
summary: "BigQuery analytics database with read-only mirrors of Firestore"
```

No `secrets:` or `dependencies:` keys needed.
