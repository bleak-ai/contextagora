# AI-Native Module Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/add-integration` slash command to the built-in chat that walks users through creating a new context module by handing them a generation prompt to run elsewhere, then validating, adapting, and saving the pasted result.

**Architecture:** Agent-driven, matching the existing `/download` command pattern. One new `CommandDef` entry in `platform/src/commands.py` whose `prompt` instructs the chat agent to perform all turns (dispense → review → adapt → save). Two new markdown files hold the canonical generation prompt and the example-adaptation rules so the content is editable in one place. No backend interception, no session state, no new Python modules. Saves go through the existing `POST /api/modules` endpoint via the agent's `Bash` tool.

**Tech Stack:** Python 3 / FastAPI / pydantic (existing), `claude` CLI subprocess (existing), markdown prompt files.

**Spec:** `docs/superpowers/specs/2026-04-07-ai-native-module-creation-design.md`

---

## File structure

**Create:**
- `platform/src/prompts/__init__.py` — package marker so `commands.py` can locate the prompts directory.
- `platform/src/prompts/add_module.md` — canonical generation prompt the agent dispenses to the user in turn 1.
- `platform/src/prompts/adapt_examples.md` — transformation rules the agent applies when rewriting non-conforming examples.
- `platform/tests/test_add_integration_command.py` — pytest verifying the command is registered and the prompt embeds both prompt files.

**Modify:**
- `platform/src/commands.py` — add a new `CommandDef` named `add-integration` whose `prompt` is built at import time by reading the two markdown files from `platform/src/prompts/`.

**Untouched:**
- `platform/src/routes/commands.py` — already exposes whatever is in `COMMANDS`, no changes needed.
- `platform/src/routes/chat.py` — no interception, the existing pass-through is exactly what we want.
- `platform/src/routes/modules.py` — `POST /api/modules` is already what the agent will call to save.
- Frontend chat UI — already lists commands from `/api/commands` and expands them client-side.

---

## Conventions for this plan

- Run all Python via `uv run`, never bare `python`. (Per global instructions and project convention.)
- Run tests from `platform/`: `cd platform && uv run pytest tests/test_add_integration_command.py -v`.
- Commit after each task. Use Conventional Commits (`feat:`, `test:`, `docs:`).
- Do NOT commit when the user has not asked for it in interactive use; in this plan execution, commits are part of the task and pre-authorized.

---

## Task 1: Create the prompts package and the `add_module.md` template

**Files:**
- Create: `platform/src/prompts/__init__.py`
- Create: `platform/src/prompts/add_module.md`

- [ ] **Step 1: Create the package marker**

Create `platform/src/prompts/__init__.py` as an empty file. This makes `platform/src/prompts/` a Python package so `commands.py` can compute its path via `Path(__file__).parent / "prompts"`.

```python
# platform/src/prompts/__init__.py
```

- [ ] **Step 2: Write `add_module.md`**

Create `platform/src/prompts/add_module.md` with the canonical generation prompt. This is the text the chat agent will display to the user in turn 1, with `{{module_name}}` and `{{source_type}}` substituted by the agent itself when it renders the message (the agent is instructed to do the substitution in the command prompt — see Task 3).

```markdown
You are helping me create a context module for "{{module_name}}" so that
future AI agents working on this project know how to use it correctly.
The module will be loaded into a separate workspace where agents read it
without seeing my actual codebase or workspace, so everything they need
must be in the file you produce.

Look at how {{module_name}} is actually used {{source_phrase}}. Be specific
to this project — do NOT write generic API documentation. Capture the real
entities, the real conventions, the real gotchas.

Produce a single markdown file with EXACTLY these top-level sections, in
this order, using these exact headings:

  # {{module_name}}
  ## Purpose
  ## Where it lives
  ## Auth & access
  ## Key entities
  ## Operations
  ## Examples
  ### Python packages

Rules:

1. "Auth & access" lists ENVIRONMENT VARIABLE NAMES ONLY. Never paste
   values, tokens, or secrets. One line per variable explaining what it
   is and where it comes from.

2. "Key entities" must reflect THIS project's usage — real table names,
   real metadata fields, real plan names, real status values. If you
   don't know, inspect the code/workspace; do not invent.

3. "Operations" must include explicit "Never" items where there's risk
   (deleting customers, mutating prod data, etc.).

4. "Examples" must use the project's execution convention. Every
   runnable Python snippet MUST be wrapped as:

       varlock run --path ./{{module_name}} -- sh -c 'uv run python -c "
       <python code that reads secrets from os.environ>
       "'

   Do NOT use `python` directly. Do NOT call `load_dotenv()`. Do NOT
   hardcode secrets. Do NOT use `--with` flags on `uv` (deps are
   pre-installed by the host). The agent loading this module will
   execute commands this exact way — anything else will fail or be
   ignored.

   For shell-only examples (curl, psql, etc.), wrap as:

       varlock run --path ./{{module_name}} -- sh -c '<command using $VAR>'

   Always use `sh -c '...'` so that `$VAR` is expanded AFTER varlock
   injects the values. Never `varlock run -- echo $VAR` directly.

5. "Python packages" lists packages the examples import. One per line,
   no versions unless required.

6. Be concrete. Prefer one real example over three abstract ones.

Output the markdown file and nothing else.
```

- [ ] **Step 3: Verify the file was written**

Run: `cd platform && uv run python -c "from pathlib import Path; p = Path('src/prompts/add_module.md'); assert p.exists(); assert '{{module_name}}' in p.read_text(); print('OK')"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add platform/src/prompts/__init__.py platform/src/prompts/add_module.md
git commit -m "feat(prompts): add canonical add_module generation prompt"
```

---

## Task 2: Create the `adapt_examples.md` rules file

**Files:**
- Create: `platform/src/prompts/adapt_examples.md`

- [ ] **Step 1: Write `adapt_examples.md`**

Create `platform/src/prompts/adapt_examples.md` with the transformation rules. The chat agent reads these rules in turn 2 when it detects non-conforming examples in the user's paste.

```markdown
You are rewriting code examples inside a context module's "## Examples"
section so they conform to this project's execution convention.

The convention is:

  varlock run --path ./<module_name> -- sh -c 'uv run python -c "
  <python code>
  "'

Apply ALL of these rules:

1. Wrap every Python snippet in:
       varlock run --path ./<module_name> -- sh -c 'uv run python -c "..."'
   `<module_name>` is the module being created.

2. Inside the python, read every secret from `os.environ["VAR_NAME"]`.
   Inside the heredoc, escape inner double quotes as `\"` — never use
   single quotes for the `os.environ` key, because the outer `sh -c`
   already uses single quotes.

3. Remove any of the following — they break the model:
   - `from dotenv import load_dotenv` / `load_dotenv()`
   - `python script.py` style invocations (rewrite as inline `python -c`)
   - Hardcoded API keys, tokens, URLs with embedded credentials
   - `os.getenv("X", "default-value")` with a real default
   - `--with` flags on `uv` (deps are pre-installed)

4. For shell-only examples (curl, psql, etc.), wrap as:
       varlock run --path ./<module_name> -- sh -c '<command using $VAR>'
   Do NOT use `varlock run -- echo $VAR` directly — the parent shell
   would expand `$VAR` before varlock injects. Always wrap in
   `sh -c '...'`.

5. If the original example uses a different language (Node, Go, Bash),
   keep the language but still wrap it in
   `varlock run --path ./<module_name> -- sh -c '...'`.

6. Never invent new examples. Only transform what's there. If an example
   references a secret that isn't in the module's "## Auth & access"
   section, flag it in a comment above the rewritten block:
       # NOTE: this example uses STRIPE_WEBHOOK_SECRET which is not
       # declared in Auth & access — add it there or remove this example.

7. Preserve the original example's intent and surrounding prose. Only
   the code blocks change.

When you rewrite a snippet, show both versions so the user can see the
diff:

    Before:
    ```python
    import os
    from dotenv import load_dotenv
    load_dotenv()
    ...
    ```

    After:
    ```bash
    varlock run --path ./<module_name> -- sh -c 'uv run python -c "
    import os
    ...
    "'
    ```
```

- [ ] **Step 2: Verify the file was written**

Run: `cd platform && uv run python -c "from pathlib import Path; p = Path('src/prompts/adapt_examples.md'); assert p.exists(); assert 'varlock run' in p.read_text(); print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add platform/src/prompts/adapt_examples.md
git commit -m "feat(prompts): add adapt_examples transformation rules"
```

---

## Task 3: Register the `/add-integration` slash command

**Files:**
- Modify: `platform/src/commands.py`

This is the central change. We add one new `CommandDef` whose `prompt` is built at import time by reading the two markdown files. The prompt is structured so the agent knows: how to handle turn 1 (dispense), how to handle the user's paste in turn 2 (parse, validate, adapt, summarize), and how to handle confirmation in turn 3 (save via `Bash` + `curl`).

- [ ] **Step 1: Read the current file**

Run: `cd platform && uv run python -c "from src import commands; print(len(commands.COMMANDS))"`

Expected: `1` (the existing `download` command).

- [ ] **Step 2: Modify `platform/src/commands.py`**

Add an import for `Path`, a helper to load prompt files, a long `_ADD_INTEGRATION_PROMPT` string built from the two markdown files, and a new entry in `COMMANDS`.

Replace the existing file with:

```python
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


_ADD_MODULE_TEMPLATE = _load_prompt("add_module.md")
_ADAPT_EXAMPLES_RULES = _load_prompt("adapt_examples.md")


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

2. A fenced code block containing the generation prompt below, with `{{{{module_name}}}}` replaced by the actual module name the user gave you, and `{{{{source_phrase}}}}` replaced by `"in this codebase"` if source type is `codebase`, or `"in my workspace"` if source type is `workspace`. The literal `{{{{module_name}}}}` placeholder for inside the example varlock command should remain as `<module_name>` literal text — but the heading and prose substitutions should use the real name.

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
```

Note the use of `f"""..."""` so that `{_ADD_MODULE_TEMPLATE}` and `{_ADAPT_EXAMPLES_RULES}` get inlined at import time. The literal placeholders inside those embedded templates that we want preserved (e.g. the `{{module_name}}` the agent will substitute itself) are written as `{{{{module_name}}}}` in the f-string source above so they survive f-string formatting and end up as `{{module_name}}` in the final string. **This double-escaping is critical** — if you write single braces, the f-string parser will explode.

- [ ] **Step 3: Sanity check the import**

Run: `cd platform && uv run python -c "from src import commands; print(len(commands.COMMANDS)); print([c.name for c in commands.COMMANDS])"`

Expected:
```
2
['download', 'add-integration']
```

- [ ] **Step 4: Sanity check that both prompt files were embedded**

Run: `cd platform && uv run python -c "from src.commands import COMMANDS; p = next(c for c in COMMANDS if c.name == 'add-integration').prompt; assert 'Look at how' in p; assert 'varlock run --path' in p; assert 'os.environ' in p; print('OK', len(p), 'chars')"`

Expected: `OK <some-number> chars` where the number is several thousand.

- [ ] **Step 5: Sanity check the API**

Start the server in one terminal:
```bash
cd platform && uv run start
```

In another terminal:
```bash
curl -sS http://localhost:8080/api/commands | uv run python -c "import sys, json; d = json.load(sys.stdin); names = [c['name'] for c in d['commands']]; assert 'add-integration' in names, names; print('OK:', names)"
```

Expected: `OK: ['download', 'add-integration']`

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add platform/src/commands.py
git commit -m "feat(chat): add /add-integration slash command"
```

---

## Task 4: Add a regression test for the command registration

**Files:**
- Create: `platform/tests/test_add_integration_command.py`

We add a small pytest that locks in: (a) the command is registered, (b) the embedded prompts contain the load-bearing strings, (c) the f-string brace escaping is correct (the agent-side `{{module_name}}` placeholder is preserved). This guards against future edits that accidentally break the embedding.

- [ ] **Step 1: Confirm pytest is available**

Run: `cd platform && uv run pytest --version`

Expected: pytest version printed (e.g. `pytest 8.x.y`). If pytest is not installed, install it via `cd platform && uv add --dev pytest` and commit `pyproject.toml` + `uv.lock` together with the test in step 4.

- [ ] **Step 2: Write the failing test**

Create `platform/tests/test_add_integration_command.py`:

```python
"""Regression tests for the /add-integration slash command registration."""

from src.commands import COMMANDS


def _get_add_integration():
    return next(c for c in COMMANDS if c.name == "add-integration")


def test_add_integration_is_registered():
    names = [c.name for c in COMMANDS]
    assert "add-integration" in names


def test_add_integration_has_description():
    cmd = _get_add_integration()
    assert cmd.description
    assert len(cmd.description) > 10


def test_prompt_embeds_add_module_template():
    cmd = _get_add_integration()
    # Sentinel strings from add_module.md
    assert "Look at how" in cmd.prompt
    assert "## Purpose" in cmd.prompt
    assert "## Auth & access" in cmd.prompt
    assert "### Python packages" in cmd.prompt


def test_prompt_embeds_adapt_examples_rules():
    cmd = _get_add_integration()
    # Sentinel strings from adapt_examples.md
    assert "load_dotenv" in cmd.prompt
    assert "os.environ" in cmd.prompt
    assert "varlock run --path" in cmd.prompt


def test_prompt_preserves_module_name_placeholder():
    """The agent-facing `{{module_name}}` placeholder must survive f-string
    formatting. If the f-string braces in commands.py are wrong, this fails."""
    cmd = _get_add_integration()
    assert "{module_name}" in cmd.prompt
    # And it must NOT have been formatted to an empty string or KeyError'd
    assert "{{module_name}}" not in cmd.prompt  # double-brace should collapse
```

- [ ] **Step 3: Run the test**

Run: `cd platform && uv run pytest tests/test_add_integration_command.py -v`

Expected: 5 passed.

If `test_prompt_preserves_module_name_placeholder` fails, the f-string brace escaping in `commands.py` is wrong — the embedded templates should contain `{{module_name}}` (the agent's substitution placeholder), and in the f-string source they must be written as `{{{{module_name}}}}` (4 braces) so that f-string formatting yields `{{module_name}}` (2 braces) in the final string. Fix `commands.py` and re-run.

- [ ] **Step 4: Commit**

```bash
git add platform/tests/test_add_integration_command.py
git commit -m "test(commands): regression test for /add-integration registration"
```

---

## Task 5: End-to-end smoke test in the chat UI

This task is manual — there's no automation for the full chat round-trip. The goal is to confirm the command actually works for a user.

- [ ] **Step 1: Start the dev server**

```bash
cd platform && uv run start
```

- [ ] **Step 2: Open the chat UI**

Visit `http://localhost:8080/` (or wherever the chat route lives). Type `/` and confirm the dropdown lists `add-integration` alongside `download`.

- [ ] **Step 3: Invoke the command**

Type `/add-integration linear codebase` and send. Expected: the assistant replies with the explainer block, the filled generation prompt in a code block, and the closing instruction. The module name `linear` should appear inside the prompt (e.g. in the `varlock run --path ./linear` example).

- [ ] **Step 4: Paste a fake `info.md`**

Paste this synthetic, intentionally non-conforming module content as the next message:

```markdown
# linear

## Purpose
We use Linear as our issue tracker. Every customer-facing bug becomes an
issue in the "Acme" project.

## Where it lives
Linear workspace: acme.linear.app, project "Acme".

## Auth & access
- LINEAR_API_KEY — personal API key with read+write scope on the Acme project.

## Key entities
- Issue — has identifier (e.g. ACME-123), state, assignee, project.
- Project — top-level grouping. We only care about "Acme" for now.

## Operations
- Read issues, comments, projects.
- Create new issues in the Acme project.
- Never delete issues.

## Examples
```python
import os
from dotenv import load_dotenv
from linear_sdk import LinearClient

load_dotenv()
client = LinearClient(api_key=os.environ["LINEAR_API_KEY"])
print(len(list(client.issues.list())))
```

### Python packages
- linear-sdk
```

Expected: the assistant posts a review report. It should:
- Show ✅ for the 6 sections.
- Detect the non-conforming example (uses `load_dotenv`, no `varlock run` wrapper).
- Show a `Before` / `After` diff where the rewritten version is wrapped in `varlock run --path ./linear -- sh -c 'uv run python -c "..."'` and `load_dotenv()` is removed.
- Surface `LINEAR_API_KEY` as the extracted secret.
- Surface `linear-sdk` as the package.
- Ask for `save` / `keep original` / repaste.

If the agent skips adaptation or hallucinates content, the prompt needs tuning. Iterate on `commands.py` (and re-run the regression test from Task 4).

- [ ] **Step 5: Confirm the save**

Reply `save`. Expected: the assistant calls `POST /api/modules` via `Bash`+`curl`, gets a 201, and confirms the module was created. Verify directly:

```bash
curl -sS http://localhost:8080/api/modules | uv run python -c "import sys, json; mods = json.load(sys.stdin)['modules']; assert any(m == 'linear' or (isinstance(m, dict) and m.get('name') == 'linear') for m in mods), mods; print('OK')"
```

Expected: `OK`. If the module already existed before this test, delete it via `curl -X DELETE http://localhost:8080/api/modules/linear` first.

Then check the saved `info.md`:

```bash
curl -sS http://localhost:8080/api/modules/linear | uv run python -c "import sys, json; d = json.load(sys.stdin); assert 'varlock run --path' in d['content'], 'examples not adapted'; assert 'LINEAR_API_KEY' in d.get('secrets', []), d.get('secrets'); print('OK')"
```

Expected: `OK`.

- [ ] **Step 6: Clean up the test module**

```bash
curl -sS -X DELETE http://localhost:8080/api/modules/linear
```

- [ ] **Step 7: No commit needed**

This task is verification only. If anything failed, fix in the relevant earlier task and re-run from there.

---

## Definition of done

- `cd platform && uv run pytest tests/test_add_integration_command.py -v` passes.
- `GET /api/commands` returns both `download` and `add-integration`.
- A real chat session of `/add-integration <name>` → paste → `save` produces a new module on disk via `POST /api/modules`, with adapted examples and a populated `.env.schema`.
- No new files in `platform/src/` other than the two prompt markdown files and the prompts package marker.
- No changes to `platform/src/routes/chat.py`, `platform/src/routes/commands.py`, or `platform/src/routes/modules.py`.
