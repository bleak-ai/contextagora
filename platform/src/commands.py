"""Static slash-command registry consumed by the /api/commands endpoint."""

from dataclasses import dataclass
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_prompt(name: str) -> str:
    """Read a prompt markdown file from src/prompts/."""
    return (_PROMPTS_DIR / name).read_text()


@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    prompt: str


_DOWNLOAD_PROMPT = """Download files written in this session

Scan the conversation history for files written using the Write tool in this session.

**If a hint was provided after `/download`** (e.g. `/download csv` or `/download report`), use it to match against filenames or paths — pick the best match.

**If no hint was provided**, use all written files.

---

## Rules

- Construct each download link using this format:
  `[filename](/api/files/download?path=URL_ENCODED_FULL_PATH)`
  where the path is URL-encoded (e.g. `/tmp/data.csv` → `/api/files/download?path=%2Ftmp%2Fdata.csv`).

- If **one file** matches → reply with a single download link, no extra commentary.

- If **multiple files** match → list them all as download links, putting the most recently written one first with a "(latest)" label.

- If **no files were written** in this session → say "No files written in this session." and nothing else.

Do not explain your reasoning. Just output the link(s).
"""


_ADD_MODULE_TEMPLATE = _load_prompt("add_module.md").replace("{{", "{").replace("}}", "}")
_ADAPT_EXAMPLES_RULES = _load_prompt("adapt_examples.md").replace("{{", "{").replace("}}", "}")


_ADD_INTEGRATION_PROMPT = f"""Add a new context module by walking the user through a conversational intake flow.

You are running inside the context-loader chat. The user invoked `/add-integration` to create a new module. The argument after the command is the module name (lowercase, e.g. `linear`, `stripe`, `gmail`).

IMPORTANT: If the user typed only `/add-integration` with no arguments — no module name at all — you MUST ask the user which integration they want to add. Do NOT guess or infer a module name from conversation history or any other context. Just ask: "Which integration would you like to add? Give me a name (e.g. `stripe`, `linear`, `gmail`)." and STOP. Do not proceed until the user explicitly provides a name.

Normalize the module name to a lowercase-hyphenated slug (e.g. `Cloud Firestore` → `firestore`, `Personal Gmail` → `personal-gmail`).

You will perform a multi-turn conversational flow inside this single chat thread. There is no backend state — everything you need is in the conversation history. Re-read the history at the start of each of your turns to know which step you are on.

═══════════════════════════════════════════════════════════════
PHASE 1 — Conversational intake
═══════════════════════════════════════════════════════════════

Your goal is to gather enough information to build a complete module. You do this by **asking the user questions conversationally**, not by dumping a form or a prompt to run elsewhere.

Start by asking the first batch of questions. Ask in natural language, grouping related questions together. Do NOT ask everything at once — keep it to 2-4 questions per turn, ordered by priority.

**Information you need to gather** (in rough priority order):

1. **Purpose** — What does this integration do for the user's project/business? Why do they need it?
2. **Where it lives** — Is this tied to a codebase (which repo/path)? A SaaS account? A workspace? Or is it a standalone service the user accesses directly?
3. **Auth & access** — How does one authenticate? API key? OAuth? Service account JSON? What are the env var names (no values)? What scopes/permissions are needed?
4. **Key entities** — What are the important nouns? (e.g., for Gmail: messages, labels, threads, drafts). What fields/properties matter for the user's use case?
5. **Operations** — What should an agent be able to do? What should it NEVER do? (e.g., "read emails: yes", "delete emails: never", "send on behalf of user: only drafts")
6. **Examples** — Concrete runnable snippets. Gather these naturally from the conversation — the user might describe how they use the tool and you can turn that into code.
7. **Python packages** — What packages are needed?

**Adapt your questions to the integration type:**

- For a **codebase integration** (e.g., Firestore, BigQuery, Stripe in a specific app): ask about repo paths, existing code patterns, which collections/tables/endpoints are used, and consider suggesting the user run a generation prompt in their codebase to extract real details. The generation prompt template is available below for this case.
- For a **SaaS/workspace tool** (e.g., Linear, Notion, Slack): ask about the workspace, which projects/spaces/channels matter, what operations the agent should perform.
- For a **personal service** (e.g., personal Gmail, personal calendar): ask about the account, what the agent should be able to read/write, what's off-limits, how they authenticate (app password, OAuth, etc.).
- For a **database** (e.g., Postgres, Redis): ask about connection details (env var names), which schemas/tables matter, read vs write permissions.

**When to suggest the generation prompt:**

ONLY suggest running a generation prompt in another tool (Cursor, Claude Code, etc.) when ALL of these are true:
- The integration is tied to a specific codebase
- The codebase contains significant existing usage of the service
- Scanning that code would yield better details than asking the user

If you suggest it, provide the prompt from the template below with `{{module_name}}` replaced. But frame it as ONE option, not the only path: "If you have this in a codebase, you could run this prompt there to extract the details. Otherwise, just answer my questions and I'll build the module from our conversation."

Generation prompt template (use ONLY when appropriate):
```
{_ADD_MODULE_TEMPLATE}
```

**Keep going until you have enough.** After each user response, assess what's still missing and ask follow-up questions. When you believe you have enough information for a solid module, move to Phase 2.

═══════════════════════════════════════════════════════════════
PHASE 2 — Draft review
═══════════════════════════════════════════════════════════════

When you have gathered enough information (either through conversation or from a pasted generation), assemble the full module content and present it to the user for review.

1. **Build the module markdown** with these exact sections:

   ```
   # <module_name>

   ## Purpose
   ...

   ## Where it lives
   ...

   ## Auth & access
   ...

   ## Key entities
   ...

   ## Operations
   ...

   ## Examples
   ...

   ### Python packages
   ...
   ```

2. **Ensure examples conform to the varlock convention.** Every runnable Python snippet MUST be wrapped as:

       varlock run -- sh -c 'uv run python -c "
       <python code that reads secrets from os.environ>
       "'

   For shell-only examples: `varlock run -- sh -c '<command using $VAR>'`

   Apply the example adaptation rules:
   ```
{_ADAPT_EXAMPLES_RULES}
   ```

   Do NOT use `python` directly. Do NOT use `load_dotenv()`. Do NOT hardcode secrets. Do NOT use `--with` flags on `uv`.

3. **Auth & access rules:**
   - List ENVIRONMENT VARIABLE NAMES ONLY — never paste values, tokens, or secrets.
   - File-based credentials (Google service account JSON, PEM keys, etc.) must be reshaped into a single string secret. Convention: `<SERVICE>_SA_JSON` for JSON blobs, `<SERVICE>_KEY_PEM` for PEM blobs.
   - Do NOT declare file-path variables like `GOOGLE_APPLICATION_CREDENTIALS`.
   - Code must parse inline: `json.loads(os.environ["GCP_SA_JSON"])`.

4. **Extract secrets and packages** from the content.

5. **Present the draft** to the user with a review summary:

       ✅ Purpose
       ✅ Where it lives
       ✅ Auth & access — N secrets: VAR_A, VAR_B
       ✅ Key entities
       ✅ Operations
       ✅ Examples — N snippets (varlock-conforming)
       ✅ Python packages — pkg-a, pkg-b

       [full module markdown]

       Reply **save** to confirm, or tell me what to change.

═══════════════════════════════════════════════════════════════
PHASE 3 — Save on confirmation
═══════════════════════════════════════════════════════════════

When the user replies with `save`:

1. Build the request body for `POST /api/modules`:

       {{
         "name": "<module_name>",
         "content": "<final module markdown>",
         "summary": "",
         "secrets": ["VAR_A", "VAR_B"],
         "requirements": ["pkg-a", "pkg-b"]
       }}

2. Call the endpoint via `Bash` + `curl`. Write the JSON body to a temp file first:

       cat > /tmp/add_integration_body.json <<'JSON_EOF'
       {{ ...the JSON above... }}
       JSON_EOF
       curl -sS -X POST http://localhost:8080/api/modules \\
         -H 'Content-Type: application/json' \\
         --data-binary @/tmp/add_integration_body.json

3. Report the result:
   - On success: confirm the module was created, mention `/modules/<module_name>` in the web UI.
   - On 409: tell the user it already exists and offer `PUT /api/modules/<name>` to update.
   - On error: show the error and offer to retry.

═══════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════

- Be conversational and adaptive. Ask smart questions based on what the user tells you. Don't be rigid.
- Stay in this flow only as long as the user is engaged. If they change topic, drop the flow.
- Never invent module content — everything must come from the user.
- Never paste secret values. Only variable names.
- Always use `varlock run -- sh -c '...'` in examples — never bare `python`, never `load_dotenv`, never hardcoded secrets.
- If a user pastes a large block of pre-generated markdown, accept it — parse, validate, adapt examples, and go to Phase 2.
- If the user gives short answers, that's fine — synthesize what they give you into good module content.
"""


COMMANDS: list[CommandDef] = [
    CommandDef(
        name="download",
        description="Download files written in this session",
        prompt=_DOWNLOAD_PROMPT,
    ),
    CommandDef(
        name="add-integration",
        description="Create a new context module from a generated info.md",
        prompt=_ADD_INTEGRATION_PROMPT,
    ),
]
