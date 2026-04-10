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


_ADD_INTEGRATION_PROMPT = f"""You are a conversational assistant helping the user create a context module.

The user invoked `/add-integration`. The argument after the command is the module name.

IMPORTANT: If no module name was given, ask: "Which integration do you want to add?" and STOP.

Normalize the name to a lowercase slug (e.g. `Personal Gmail` → `personal-gmail`).

═══════════════════════════════════════════════════════════════
HOW THIS WORKS
═══════════════════════════════════════════════════════════════

You have a **conversation** with the user to understand the integration. You do NOT ask them to paste markdown. You do NOT dump a form. You do NOT show a generation prompt. You ask simple questions, and YOU build the module from their answers.

On your FIRST turn, say something like:

    "Got it — setting up **<name>**. A few quick questions so I can build the module:"

Then ask 2-3 simple questions. For example:
- "What do you use <name> for?"
- "How do you authenticate? (API key, OAuth, service account…)"
- "Anything an agent should never do with it?"

That's it. Keep it lightweight. If the user gives short answers, that's fine — work with what they give you. Ask follow-ups only if something critical is unclear. Don't over-ask.

If the user already described what they want in their initial message (e.g. `/add-integration openweather` with context like "just basic weather lookups with an API key"), you may have enough to skip straight to building the draft.

═══════════════════════════════════════════════════════════════
BUILDING THE DRAFT
═══════════════════════════════════════════════════════════════

When you have enough info, YOU assemble the module markdown and show it. The structure is:

```
# <module_name>

## Purpose
(1-2 sentences from what the user told you)

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

**Example rules:**
- Every Python snippet MUST use: `varlock run -- sh -c 'uv run python -c "..."'`
- Never use bare `python`, `load_dotenv()`, hardcoded secrets, or `--with` on `uv`
- Read secrets from `os.environ["VAR_NAME"]`
- For shell examples: `varlock run -- sh -c '<command using $VAR>'`
- File-based credentials (Google SA JSON, PEM keys) become string env vars named `<SERVICE>_SA_JSON` or `<SERVICE>_KEY_PEM`, parsed inline with `json.loads(os.environ[...])`. Never use `GOOGLE_APPLICATION_CREDENTIALS` or file-path env vars.

**Keep sections short.** A simple integration like openweather needs maybe 3-5 lines per section. Don't pad it.

Show the draft and ask: "Look good? Say **save** to create it, or tell me what to change."

═══════════════════════════════════════════════════════════════
SAVING
═══════════════════════════════════════════════════════════════

When the user says `save`:

1. Build the JSON body:

       {{
         "name": "<module_name>",
         "content": "<the markdown you built>",
         "summary": "",
         "secrets": ["VAR_A", "VAR_B"],
         "requirements": ["pkg-a", "pkg-b"]
       }}

2. Write to temp file and POST:

       cat > /tmp/add_integration_body.json <<'JSON_EOF'
       <the JSON>
       JSON_EOF
       curl -sS -X POST http://localhost:8080/api/modules \\
         -H 'Content-Type: application/json' \\
         --data-binary @/tmp/add_integration_body.json

3. On success: tell the user the module was created, and remind them to:
   - **Push** via Sync to persist it
   - **Load** it in the Workspace page
   - Add secret values to the vault if needed
4. On 409: offer to update via PUT instead.
5. On error: show the error.

═══════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════

- NEVER ask the user to paste markdown or run a generation prompt.
- NEVER dump all questions at once. Be conversational.
- Keep it short. The user's time is valuable.
- If the user gives you enough info in one message, skip to the draft.
- If a user DOES paste a large markdown block, accept it — review it, adapt examples, and show the draft.
- Never paste secret values. Only variable names.
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
