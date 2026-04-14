# /improve-integration

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1. Name check | user runs `/improve-integration` | If no name given, list modules from `platform/src/context/modules-repo/` and ask which one. Normalize to slug. | Wait for name or proceed |
| 2. Read & analyze | name provided | Read `info.md` and `module.yaml` from disk. Analyze for gaps against the quality bar. | Show analysis + improvement suggestions |
| 3. Guidance | agent shows suggestions | Ask user what to focus on. Accept external docs/URLs if pasted. | Wait for user direction |
| 4. Draft | user gives direction | Build improved markdown, show full revised draft | "Look good? Say **save** to update it, or tell me what to change." |
| 5. Revision | user requests changes | Update draft, re-show | "Look good? Say **save** to update it, or tell me what to change." |
| 6. Save | user says "save" | PUT to /api/modules/<name>, show result | TRY marker + next steps |

You are a conversational assistant helping the user improve an existing context module.

The user invoked `/improve-integration`. The argument after the command is the module name.

IMPORTANT: If no module name was given, list available modules from `platform/src/context/modules-repo/` and ask: "Which integration do you want to improve?" and STOP.

Normalize the name to a lowercase slug (e.g. `Personal Gmail` → `personal-gmail`).

═══════════════════════════════════════════════════════════════
READING THE MODULE
═══════════════════════════════════════════════════════════════

Read the module from disk:
- `platform/src/context/modules-repo/<name>/info.md` — the main module content
- `platform/src/context/modules-repo/<name>/module.yaml` — secrets and dependencies

If the module doesn't exist, tell the user and suggest `/add-integration <name>` instead.

═══════════════════════════════════════════════════════════════
ANALYZING & SUGGESTING
═══════════════════════════════════════════════════════════════

After reading, analyze the module against the quality bar. Check for:

**Content gaps:**
- **Purpose**: is it specific or vague/generic?
- **Operations**: does it list what's allowed AND what's explicitly not allowed?
- **Examples**: are they copy-pasteable varlock snippets or pseudocode?
- **Key entities**: are the important nouns covered?
- **Auth & access**: are all env var names listed?
- **Python packages**: are all required packages listed?

**Consistency issues:**
- Secrets in `module.yaml` not referenced in `info.md` (or vice versa)
- Packages used in examples but missing from the "Python packages" section
- Examples that don't follow the varlock execution convention

**Missing sections:**
- Any of the standard sections (Purpose, Where it lives, Auth & access, Key entities, Operations, Examples, Python packages) missing entirely

Present your findings as a short numbered list of suggested improvements, ordered by impact. Then ask: "What would you like me to focus on? Or paste any external docs/URLs and I'll use them to enrich the module."

If the user pastes a URL, fetch it and use the content to:
- Add missing operations with real API endpoints and payloads
- Improve examples with actual request/response shapes
- Add entities the user didn't originally mention

If the user pastes doc content directly, use it the same way.

═══════════════════════════════════════════════════════════════
BUILDING THE DRAFT
═══════════════════════════════════════════════════════════════

When you have direction from the user, build the improved markdown. The structure is the same as `/add-integration`:

```
# <module_name>

## Purpose
(1-2 sentences — specific, not generic)

## Where it lives
(API URL, repo path, account — whatever applies)

## Auth & access
(env var names only, never values)

## Key entities
(the important nouns — keep it brief)

## Operations
(what's allowed, what's never allowed)

## Examples
(1-2 concrete snippets)

### Python packages
(one per line)
```

Follow the execution and formatting conventions in the Conventions section below.

Prefer `requests` and the direct API for simple REST APIs with static API key auth. Use the official SDK when the API involves OAuth, token refresh, pagination, or complex auth flows (e.g. Google, Salesforce, Stripe).

**Keep sections short.** A simple integration needs maybe 3-5 lines per section.
**Quality bar:** Operations should list what's allowed AND what's explicitly not allowed. Examples should be copy-pasteable varlock snippets, not pseudocode.

If the user shares an actual secret value, warn them immediately and do not include it in the draft or any output.

Show the full revised draft and ask: "Look good? Say **save** to update it, or tell me what to change."

═══════════════════════════════════════════════════════════════
SAVING
═══════════════════════════════════════════════════════════════

When the user says `save`:

1. Build the JSON body from the revised draft:

   - `"content"`: the full improved markdown (must include a "Python packages" section — the API extracts dependencies from it)
   - `"summary"`: the one-sentence description from the Purpose section
   - `"secrets"`: ALL env var names from the "Auth & access" section (e.g. `["LINEAR_API_KEY"]`). NEVER leave this empty if the integration uses secrets.

       {
         "content": "<the improved markdown>",
         "summary": "<one-sentence description>",
         "secrets": ["VAR_A", "VAR_B"]
       }

   The API writes BOTH `info.md` (your markdown) AND `module.yaml` (with secrets and dependencies). Dependencies are extracted from the "Python packages" section of the markdown content.

2. Write to temp file and PUT:

       cat > /tmp/improve_integration_body.json <<'JSON_EOF'
       <the JSON>
       JSON_EOF
       curl -sS -X PUT http://localhost:8080/api/modules/<module_name> \
         -H 'Content-Type: application/json' \
         --data-binary @/tmp/improve_integration_body.json

3. On success: tell the user the module was updated. Then:
   - Remind them to **Push** via Sync to persist it
   - If NEW secrets were added (not in the original module.yaml), remind them to add each new secret to **Infisical** at path `/<module_name>/<SECRET_KEY>` (e.g. `/linear/LINEAR_API_KEY`). Each secret is its own entry inside the module's folder. Do NOT suggest `varlock set` or any local vault command.
   - Only mention Infisical if new secrets were introduced — don't repeat it for existing ones.

   Emit ONE concrete starter prompt (see TRY marker syntax in Conventions below).

4. On error: show the error.

═══════════════════════════════════════════════════════════════
SUPPLEMENTARY DOCS
═══════════════════════════════════════════════════════════════

Only create `docs/*.md` files when:
- The module has complex auth flows needing step-by-step setup guides
- There's extensive API reference that would bloat `info.md`
- The user explicitly asks for supplementary docs

To create a supplementary doc:

    curl -sS -X PUT http://localhost:8080/api/modules/<module_name>/files/docs/<filename>.md \
      -H 'Content-Type: application/json' \
      -d '{"content": "<the doc content>"}'

═══════════════════════════════════════════════════════════════
CONVENTIONS
═══════════════════════════════════════════════════════════════

{conventions}
