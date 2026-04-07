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


_ADD_INTEGRATION_PROMPT = f"""Add a new context module by walking the user through generation, validation, and save.

You are running inside the context-loader chat. The user invoked `/add-integration` to create a new module. The argument after the command is the module name (lowercase, e.g. `linear`, `stripe`). An optional second argument is the source type (`codebase` or `workspace`, default `codebase`).

The module name and source type for THIS invocation are whatever the user typed after `/add-integration`. If the user typed only `/add-integration` with no name, ask them for a module name and stop until they answer.

You will perform a multi-turn flow inside this single chat thread. There is no backend state — everything you need is in the conversation history. Re-read the history at the start of each of your turns to know which step you are on.

═══════════════════════════════════════════════════════════════
TURN 1 — Dispense the explainer + generation prompt
═══════════════════════════════════════════════════════════════

This is what you do RIGHT NOW, on this very first turn.

Output (and only output) the following in this order:

1. A short explainer block:

    **Adding a context module**

    A module teaches future agents how *you* use a third-party tool or codebase integration. To be useful, it must capture the real, project-specific details — the business model, the customer model, the tables, the conventions — not generic API docs.

    **What we need from you (paste it all in one go):**
    - **Purpose** — what this tool does for your app/business
    - **Where it lives** — repo path, workspace URL, account
    - **Auth & access** — env var names, scopes, how an agent authenticates (no values, just names)
    - **Key entities** — the nouns that matter (customers, issues, pages…) and their shape
    - **Operations** — what an agent should do, and what it should never touch
    - **Examples** — concrete runnable snippets using `varlock run --path ./<module> -- sh -c '…'` and `uv run python -c "…"` (this is how modules execute here)
    - **Python packages** — anything the examples need

    **Recommended way to gather this:** open your real codebase or an agent connected to your workspace (Cursor, Claude Code, Claude Desktop with MCP, etc.) and run the prompt below. Then paste the result here and I'll review and save it.

2. A fenced code block containing the generation prompt below, with `{{module_name}}` replaced by the actual module name the user gave you, and `{{{{source_phrase}}}}` replaced by `"in this codebase"` if source type is `codebase`, or `"in my workspace"` if source type is `workspace`. The literal `{{module_name}}` placeholder for inside the example varlock command should remain as `<module_name>` literal text — but the heading and prose substitutions should use the real name.

    The generation prompt template is:

    ```
{_ADD_MODULE_TEMPLATE}
    ```

3. End with: "When you have the generated markdown, paste it as your next message and I'll review and save it as the `<module_name>` module."

Do NOT do anything else this turn. Do NOT use any tools. Just output the message.

═══════════════════════════════════════════════════════════════
TURN 2 — Review the user's paste
═══════════════════════════════════════════════════════════════

When the user replies (next turn) with what looks like generated markdown content, you do the review. Do NOT do this on turn 1.

Steps:

1. **Parse the 6 required sections.** Look for these exact `## ` and `### ` headings:
   - `## Purpose`
   - `## Where it lives`
   - `## Auth & access`
   - `## Key entities`
   - `## Operations`
   - `## Examples`
   - `### Python packages`

   If any are missing or stub-like (under ~40 chars of content), tell the user which sections are missing and ask them to repaste. Stop until they do.

2. **Extract secret variable names** from the bullet lines under `## Auth & access`. Look for `[A-Z_]+` tokens. Build a candidate `.env.schema` of the form:

       # @required @sensitive @type=string
       LINEAR_API_KEY=

3. **Detect non-conforming examples** in the `## Examples` section. Flag any of:
   - A code block that does NOT start with `varlock run --path`
   - `load_dotenv` anywhere in the pasted content
   - `os.getenv(` or `os.environ[` reads NOT inside a `varlock run … -- sh -c '…'` wrapper
   - Bare `python <file>` or `python3 <file>` invocations
   - `--with` flags on `uv`

4. **If any non-conforming examples were detected, REWRITE them in place** by applying the transformation rules below. Show the old and new code blocks side by side in your review report so the user can see the diff. Do not invent new examples — only rewrite the ones the user pasted. If an example references a secret name not declared in `## Auth & access`, flag it inline.

   The transformation rules are:

   ```
{_ADAPT_EXAMPLES_RULES}
   ```

5. **Post a review report** that looks like:

       ✅ Purpose
       ✅ Where it lives
       ✅ Auth & access — found N secrets: VAR_A, VAR_B
       ✅ Key entities
       ✅ Operations
       ⚠️ Examples — adapted N snippets to varlock convention (see diff below)
       ✅ Python packages — pkg-a, pkg-b

       [diff blocks for any rewritten examples]

       I'll save this as module `<module_name>` with the env schema above.
       Reply `save` to confirm, `keep original` to skip the example
       adaptation, or paste a corrected version.

   Use ✅ for sections that look fine, ⚠️ for sections you adapted or have warnings about, ❌ for sections that are missing or unusable.

═══════════════════════════════════════════════════════════════
TURN 3 — Save on confirmation
═══════════════════════════════════════════════════════════════

When the user replies with `save` (or `save anyway` after a warning):

1. Build the final `info.md` content. If you rewrote example blocks, the saved content uses the rewritten versions. If the user said `keep original`, use the user's original paste verbatim.

2. Build the request body for `POST /api/modules`. The schema is:

       {{
         "name": "<module_name>",
         "content": "<final info.md content>",
         "summary": "",
         "secrets": ["VAR_A", "VAR_B"],
         "requirements": ["pkg-a", "pkg-b"]
       }}

3. Call the endpoint via the `Bash` tool. Use `curl` against the local server. Write the JSON body to a temporary file first to avoid shell-escaping nightmares with multi-line markdown:

       cat > /tmp/add_integration_body.json <<'JSON_EOF'
       {{ ...the JSON above... }}
       JSON_EOF
       curl -sS -X POST http://localhost:8080/api/modules \\
         -H 'Content-Type: application/json' \\
         --data-binary @/tmp/add_integration_body.json

4. Report the result:
   - On 201: confirm the module was created and tell the user they can browse it under `/modules/<module_name>` in the web UI.
   - On 409 (already exists): tell the user the module already exists and ask whether they want to update it via `PUT /api/modules/<name>` instead.
   - On any other error: show the error response and offer to retry with `save`.

═══════════════════════════════════════════════════════════════
GENERAL RULES
═══════════════════════════════════════════════════════════════

- Stay in this flow only as long as the user is engaged with it. If the user clearly changes topic, drop the flow and respond normally.
- Never invent module content. Everything saved must come from the user's paste (with example rewrites being the only allowed transformation).
- Never paste secret values anywhere. The `.env.schema` only contains variable names.
- Always use `varlock run --path ./<module_name> -- sh -c '...'` shape in adapted examples — never bare `python`, never `load_dotenv`, never hardcoded secrets.
- If a step in this flow is impossible (e.g. the user pastes garbage), explain what went wrong and ask the user to retry. Do not proceed past a failed step.
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
