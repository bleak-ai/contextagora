# Prompt System Maintainability Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplication across chat prompts, make multi-turn flows scannable, and turn `commands.py` into a clean registry.

**Architecture:** Extract shared conventions (varlock rules, TRY marker syntax, secret naming) into a single partial that gets injected into each prompt at load time. Move the inline `_ADD_INTEGRATION_PROMPT` to its own `.md` file. Make `/introduction` compose the `/add-integration` prompt instead of duplicating its save flow. Add state-machine tables to multi-turn prompts.

**Tech Stack:** Python (FastAPI), Markdown prompt files

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `platform/src/prompts/_conventions.md` | **Create** | Single source of truth for varlock wrapping, TRY marker syntax, secret naming, and execution conventions |
| `platform/src/prompts/add_integration.md` | **Create** | Full `/add-integration` prompt (moved out of `commands.py`) |
| `platform/src/prompts/introduction.md` | **Modify** | Add state table, replace turns 4-5 with `{add_integration_prompt}` placeholder |
| `platform/src/prompts/guide.md` | **Modify** | Add state table, replace duplicated TRY marker rules with `{conventions}` |
| `platform/src/prompts/add_module.md` | **No change** | Read raw by agent at runtime — conventions stay inline (not processed by Python) |
| `platform/src/prompts/adapt_examples.md` | **No change** | Read raw by agent at runtime — conventions stay inline (not processed by Python) |
| `platform/src/prompts/download.md` | **Create** | Move `_DOWNLOAD_PROMPT` out of `commands.py` |
| `platform/src/commands.py` | **Modify** | Thin registry — all prompts loaded from files, convention injection wired up |
| `platform/src/prompts/llms.txt` | **Create** | Navigation file for the prompts directory |
| `llms.txt` | **Modify** | Update root navigation to reflect new prompt structure |
| `CLAUDE.md` | **Modify** | Update coupling table to reference `_conventions.md` as the single source |

---

### Task 1: Extract shared conventions into `_conventions.md`

**Files:**
- Create: `platform/src/prompts/_conventions.md`

This is the foundation — every other task depends on this file existing.

- [ ] **Step 1: Identify all duplicated convention blocks**

Read these files and note every block that describes the same rules:
- `platform/src/prompts/add_module.md` — rules 1, 4, 5 (varlock wrapping, shell examples, packages)
- `platform/src/prompts/adapt_examples.md` — rules 1-5 (varlock wrapping, shell examples, dotenv removal, file-based creds)
- `platform/src/commands.py` — `_ADD_INTEGRATION_PROMPT` "Example rules" block and saving rules
- `platform/src/prompts/guide.md` — TRY marker syntax rules
- `platform/src/prompts/introduction.md` — TRY marker syntax rules

- [ ] **Step 2: Write `_conventions.md`**

Create `platform/src/prompts/_conventions.md` with these sections, each distilled from the duplicated blocks:

```markdown
# Execution & Formatting Conventions

These conventions are injected into prompts that need them. This is the
single source of truth — update HERE, not in individual prompts.

## Varlock execution convention

Every runnable Python snippet MUST be wrapped as:

    varlock run -- sh -c 'uv run python -c "
    <python code that reads secrets from os.environ>
    "'

Rules:
- Do NOT use `python` directly. Do NOT call `load_dotenv()`. Do NOT
  hardcode secrets. Do NOT use `--with` flags on `uv` (deps are
  pre-installed by the host).
- Read every secret from `os.environ["VAR_NAME"]`.
- Inside the heredoc, escape inner double quotes as `\"`.
- For shell-only examples (curl, psql, etc.), wrap as:
      varlock run -- sh -c '<command using $VAR>'
  Always use `sh -c '...'` so that `$VAR` is expanded AFTER varlock
  injects the values. Never `varlock run -- echo $VAR` directly.

## File-based credentials

Varlock injects string VALUES into environment variables; it does NOT
manage files on disk. Any third party that authenticates via a credentials
FILE must be reshaped into a single string secret.

Convention: name such secrets `<SERVICE>_SA_JSON` (e.g. `GCP_SA_JSON`,
`FIREBASE_SA_JSON`) or `<SERVICE>_KEY_PEM` for PEM blobs. Do NOT declare
`GOOGLE_APPLICATION_CREDENTIALS` or any "path to a file" variable.

In examples, parse the value inline:

    import os, json
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GCP_SA_JSON"])
    )

## Secret handling

- List ENVIRONMENT VARIABLE NAMES ONLY in "Auth & access". Never paste
  values, tokens, or secrets.
- Secrets are stored in Infisical at path `/<module_name>`, one key per
  secret variable.

## TRY marker syntax

Emit concrete starter prompts the user can click using this exact format:

    <<TRY: Show me the 5 most recent issues from Linear>>

Rules:
- Each marker on its own line. No surrounding code fence, no quotes.
- Replace the example with a real operation specific to the context.
- Emit ONLY after a successful save or when listing suggestions.
- Do not explain the marker to the user — they see it as a clickable button.

## Module structure

A context module is a folder containing:
- `info.md` — what the integration does, entities, operations, examples
- `module.yaml` — declares `secrets:` and `dependencies:`
- `docs/*.md` — optional supplementary docs

## Python packages

Listed in the "Python packages" section of `info.md`, one per line, no
versions unless required. These are pre-installed by the host.
```

- [ ] **Step 3: Commit**

```bash
git add platform/src/prompts/_conventions.md
git commit -m "refactor(prompts): extract shared conventions into _conventions.md"
```

---

### Task 2: Move `_ADD_INTEGRATION_PROMPT` to its own file

**Files:**
- Create: `platform/src/prompts/add_integration.md`
- Modify: `platform/src/commands.py`

- [ ] **Step 1: Create `add_integration.md`**

Move the full content of `_ADD_INTEGRATION_PROMPT` from `commands.py` into `platform/src/prompts/add_integration.md`. Add a state table at the top (before the flow description):

```markdown
# /add-integration

| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1. Name check | user runs `/add-integration` | If no name given, ask for one. Normalize to slug. | Wait for name or proceed |
| 2. Discovery | name provided | Ask 2-3 quick questions about purpose/auth/restrictions | Wait for answers |
| 3. Draft | user answers questions | Build module markdown, show draft | "Look good? Say **save** to change." |
| 4. Revision | user requests changes | Update draft, re-show | "Look good? Say **save** to change." |
| 5. Save | user says "save" | POST to /api/modules, show result | TRY marker + next steps |

---

<rest of prompt content>
```

**Important:** The current `_ADD_INTEGRATION_PROMPT` in `commands.py` is an f-string. Double-braces (`{{` / `}}`) in the f-string render as literal single braces. When copying to the `.md` file, convert all `{{` to `{` and `}}` to `}`, EXCEPT for the `{conventions}` placeholder which must remain as-is. The `.replace("{conventions}", ...)` call in `_load_prompt` only matches that exact string, so literal `{` in JSON examples won't be affected.

In the prompt content, replace the "Example rules" block and TRY marker explanation with references like "see Conventions below". Put `{conventions}` once at the very end of the file under a `## Conventions` heading. This keeps the prompt body clean while ensuring conventions are included.

- [ ] **Step 2: Create `download.md`**

Move `_DOWNLOAD_PROMPT` from `commands.py` into `platform/src/prompts/download.md`. This is simple — just the content as-is (no conventions needed for this prompt).

- [ ] **Step 3: Update `commands.py` to load from files**

After this change, `commands.py` should have NO inline prompt strings. It becomes a clean registry:

```python
"""Static slash-command registry consumed by the /api/commands endpoint."""

from dataclasses import dataclass
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_CONVENTIONS = (_PROMPTS_DIR / "_conventions.md").read_text()


def _load_prompt(name: str, inject_conventions: bool = False,
                 extra_replacements: dict[str, str] | None = None) -> str:
    """Read a prompt markdown file from src/prompts/.

    If inject_conventions is True, replace {conventions} placeholders
    with the shared conventions block.
    extra_replacements allows injecting other prompt content (e.g.
    composing /introduction with /add-integration).
    """
    raw = (_PROMPTS_DIR / name).read_text()
    if inject_conventions:
        raw = raw.replace("{conventions}", _CONVENTIONS)
    if extra_replacements:
        for key, value in extra_replacements.items():
            raw = raw.replace(key, value)
    return raw


@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    prompt: str


# Load add_integration first (used both standalone and composed into introduction)
_ADD_INTEGRATION_PROMPT = _load_prompt("add_integration.md", inject_conventions=True)

COMMANDS: list[CommandDef] = [
    CommandDef(
        name="download",
        description="Download files written in this session",
        prompt=_load_prompt("download.md"),
    ),
    CommandDef(
        name="add-integration",
        description="Create a new context module from a generated info.md",
        prompt=_ADD_INTEGRATION_PROMPT,
    ),
    CommandDef(
        name="introduction",
        description="First-time setup: discover, add, and try your first integration",
        prompt=_load_prompt("introduction.md", inject_conventions=True,
                           extra_replacements={"{add_integration_prompt}": _ADD_INTEGRATION_PROMPT}),
    ),
    CommandDef(
        name="guide",
        description="Show what's loaded right now and prompts to try",
        prompt=_load_prompt("guide.md", inject_conventions=True),
    ),
]
```

**Note on `add_module.md` and `adapt_examples.md`:** These are NOT slash commands. The current `commands.py` loads them into `_ADD_MODULE_TEMPLATE` and `_ADAPT_EXAMPLES_RULES` but those variables are **dead code** — never referenced by any other module. Remove these dead loads in this step. The `.md` files themselves remain unchanged — they are read raw by the agent at runtime via the `Read` tool, so their conventions must stay inline.

- [ ] **Step 4: Commit**

```bash
git add platform/src/prompts/add_integration.md platform/src/prompts/download.md platform/src/commands.py
git commit -m "refactor(prompts): move inline prompts to .md files, wire convention injection"
```

---

### Task 3: Make `/introduction` delegate to `/add-integration`

**Files:**
- Modify: `platform/src/prompts/introduction.md`
- Modify: `platform/src/commands.py`

- [ ] **Step 1: Add state table to `introduction.md`**

Add this at the top, after the `# /introduction` heading:

```markdown
| Turn | Trigger | Agent does | Ends with |
|------|---------|------------|-----------|
| 1 | user runs `/introduction` | Ask about their stack | Wait for reply |
| 2 | user names tools | Recommend top 3 | "Which one?" |
| 3 | user picks one | Explain how modules work | "Ready to build {chosen}?" |
| 4 | user confirms | Enter /add-integration flow (injected below) | (delegated) |
```

- [ ] **Step 2: Replace turns 4-5 with delegation placeholder**

Replace the current Turn 4 and Turn 5 content with:

```markdown
**Turn 4+ — Hand off to /add-integration.**

When the user confirms, seamlessly continue by following the /add-integration
instructions below. Do NOT tell the user to type `/add-integration` themselves.
You take over the wizard's role directly. The conversation continues as if they
had typed `/add-integration {chosen}` with the module name already provided.

═══════════════════════════════════════════════════════════════
/ADD-INTEGRATION FLOW (follows from here)
═══════════════════════════════════════════════════════════════

{add_integration_prompt}
```

- [ ] **Step 3: Wire the composition in `commands.py`**

The `_load_prompt` function and `COMMANDS` list were already written with `extra_replacements` support in Task 2. The introduction entry already uses `extra_replacements={"{add_integration_prompt}": _ADD_INTEGRATION_PROMPT}`. No Python changes needed in this task — only the `introduction.md` template changes above.

- [ ] **Step 4: Commit**

```bash
git add platform/src/prompts/introduction.md platform/src/commands.py
git commit -m "refactor(prompts): introduction delegates to add-integration instead of duplicating"
```

---

### Task 4: Update `guide.md` to use `{conventions}`

**Files:**
- Modify: `platform/src/prompts/guide.md`

**Note:** `add_module.md` and `adapt_examples.md` are left unchanged. They are read raw by the agent at runtime (not processed by Python), so `{conventions}` placeholders would appear as literal text. Their inline conventions remain as-is.

- [ ] **Step 1: Add state table to `guide.md`**

Add a state table at the top, after the `# /guide` heading:

```markdown
| Phase | Trigger | Agent does | Ends with |
|-------|---------|------------|-----------|
| 1 | user runs `/guide` | Read `llms.txt` and each module's `info.md` + `module.yaml` | — |
| 2 | data gathered | Write orientation message with module summaries + TRY markers | Done |
```

- [ ] **Step 2: Replace inline TRY marker rules with convention reference**

Replace the inline TRY marker rules (lines 26-31 and line 41) with: "Format TRY markers according to the conventions below." Add `{conventions}` at the end under a `## Conventions` heading.

- [ ] **Step 3: Verify no conventions are lost**

For each rule removed from individual prompts, confirm it exists in `_conventions.md`:
- [ ] Varlock `run -- sh -c` wrapping
- [ ] `uv run python -c` (no bare `python`)
- [ ] No `load_dotenv()`, no `--with`, no hardcoded secrets
- [ ] Shell example wrapping (`sh -c '...'`)
- [ ] File-based credentials rewrite
- [ ] TRY marker syntax
- [ ] Secret naming (`<SERVICE>_SA_JSON`)

- [ ] **Step 4: Commit**

```bash
git add platform/src/prompts/guide.md
git commit -m "refactor(prompts): replace duplicated TRY marker rules in guide.md with conventions reference"
```

---

### Task 5: Update navigation and documentation

**Files:**
- Create: `platform/src/prompts/llms.txt`
- Modify: `llms.txt` (root)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `platform/src/prompts/llms.txt`**

```markdown
# Prompts Directory

Prompt templates for chat slash commands and module-building flows.

## Files

- [_conventions.md](_conventions.md) — Single source of truth for varlock, TRY markers, secret naming, and execution conventions. Injected into other prompts via {conventions} placeholder.
- [add_integration.md](add_integration.md) — /add-integration slash command: multi-turn wizard to create a new context module from chat
- [add_module.md](add_module.md) — Template prompt for generating a module's info.md from codebase analysis
- [adapt_examples.md](adapt_examples.md) — Rules for rewriting code examples to match varlock execution conventions
- [download.md](download.md) — /download slash command: generates download links for files written in the session
- [guide.md](guide.md) — /guide slash command: shows loaded modules and suggests prompts to try
- [introduction.md](introduction.md) — /introduction slash command: 4-turn onboarding flow that delegates to /add-integration
```

- [ ] **Step 2: Update root `llms.txt`**

Update the prompts section to reference the new `llms.txt` and mention `_conventions.md` as the single source of truth for execution conventions.

- [ ] **Step 3: Update `CLAUDE.md` coupling table**

Update the coupling table to reflect that convention changes now only require updating `_conventions.md`:

```markdown
| What changed | Prompts to update |
|---|---|
| `varlock run` invocation, secret storage, execution convention | `_conventions.md` (single source — auto-injected into all prompts) |
| Module manifest format (`module.yaml` fields) | `_conventions.md` (module structure section), `add_integration.md` (SAVING section) |
| Module directory structure (`info.md`, `llms.txt`, `module.yaml`) | `_conventions.md` (module structure section) |
| Slash command flow logic (turns, phases) | The specific command's `.md` file in `prompts/` |
```

- [ ] **Step 4: Commit**

```bash
git add platform/src/prompts/llms.txt llms.txt CLAUDE.md
git commit -m "docs: update navigation and coupling table for new prompt structure"
```

---

### Task 6: Smoke test the full flow

**Files:** None (verification only)

- [ ] **Step 1: Verify `commands.py` loads without errors**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "from src.commands import COMMANDS; print([(c.name, len(c.prompt)) for c in COMMANDS])"
```

Expected: prints 4 tuples with command names and non-zero prompt lengths. No import errors.

- [ ] **Step 2: Verify convention injection worked**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "
from src.commands import COMMANDS
cmds = {c.name: c for c in COMMANDS}
# Check conventions were injected (no raw placeholder remains)
for name in ['add-integration', 'introduction', 'guide']:
    assert '{conventions}' not in cmds[name].prompt, f'{name} still has raw placeholder'
    assert 'varlock run' in cmds[name].prompt, f'{name} missing varlock convention'
print('All convention injections OK')
# Check introduction contains add-integration content
assert 'POST' in cmds['introduction'].prompt, 'introduction missing add-integration save flow'
assert '{add_integration_prompt}' not in cmds['introduction'].prompt, 'introduction has raw placeholder'
print('Introduction delegation OK')
# Check dead code was removed
import src.commands as mod
assert not hasattr(mod, '_ADD_MODULE_TEMPLATE'), 'dead _ADD_MODULE_TEMPLATE not removed'
assert not hasattr(mod, '_ADAPT_EXAMPLES_RULES'), 'dead _ADAPT_EXAMPLES_RULES not removed'
print('Dead code cleanup OK')
"
```

- [ ] **Step 3: Spot-check a rendered prompt**

```bash
cd /Users/bsampera/Documents/bleak-dev/context-loader/platform && uv run python -c "
from src.commands import COMMANDS
guide = next(c for c in COMMANDS if c.name == 'guide')
# Print first 20 lines to verify it reads naturally
for i, line in enumerate(guide.prompt.splitlines()[:20]):
    print(f'{i+1:3}: {line}')
"
```

Visually confirm: the prompt reads coherently, conventions appear where referenced, no broken formatting.
