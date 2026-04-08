# AI-Native Module Creation — Design

**Date:** 2026-04-07
**Status:** Approved for implementation planning
**Revision:** 2026-04-07 — switched from backend-pipeline architecture to
agent-driven architecture after discovering the existing slash-command
pattern in `platform/src/commands.py`. See "Architecture" section.

## Problem

The current `/modules` route lets users create and edit context modules but
the experience isn't AI-native: the user has to touch multiple files, write
`info.md` from scratch, define `.env.schema` by hand, and remember the
project's `varlock` + `uv` execution convention. Nothing in the UI helps the
user *generate* the project-specific knowledge that makes a module valuable.

The valuable content in a module is **not** generic API docs ("how Stripe
works"). It's **how this user uses Stripe in this app** — the business
model, the customer model, the tables, the webhooks, the conventions. That
knowledge lives in the user's real codebase or SaaS workspace, not in
context-loader.

## Goal

Make module creation a chat-driven flow that:

1. Tells the user exactly what context we need.
2. Hands them a ready-to-run prompt they can execute in the environment
   where their code or workspace actually lives (Cursor, Claude Code, Claude
   Desktop with MCP, etc.).
3. Accepts the pasted result, validates it, adapts non-conforming examples
   into the project's `varlock` + `uv` execution convention, and saves the
   module to GitHub.

The existing `/modules` route survives unchanged as the place to browse,
review, and edit existing modules — module *creation* moves to chat.

## Non-goals

- Generating modules from inside context-loader's own chat agent (it has no
  view of the user's real codebase or workspace, so the output would be
  generic).
- A web UI wizard for creation. Chat is the only entrypoint in v1.
- Source-type-specific templates beyond a single phrase swap.
- LLM-based section parsing — heading-split + regex is enough and
  predictable.

## Architecture

The existing chat already has a static slash-command registry in
`platform/src/commands.py`. Each `CommandDef` has `name`, `description`,
and `prompt`. The frontend lists commands via `GET /api/commands` and,
when the user types `/<name>`, expands the command's `prompt` client-side
into a normal `POST /api/chat` message. The chat agent (a `claude`
subprocess with Read/Write/Edit/Bash/Glob/Grep tools) reads the prompt
and does all the work using its tools. There is no backend interception,
no per-command Python handler, no session state machine.

`/add-integration` follows this same pattern: it is a single new
`CommandDef` whose `prompt` is a long, carefully written instruction that
tells the chat agent to walk the user through generation, validate the
paste, adapt non-conforming examples itself, show a diff, and save on
confirmation. The agent IS Claude, so the "review pipeline" and "example
adaptation" steps are prompt-engineered instructions, not Python code.
Saves happen via the agent's `Bash` tool calling the existing
`POST /api/modules` endpoint, or via direct `Write` into a local checkout
if the modules repo is available on disk.

This collapses the implementation to roughly: one new entry in
`COMMANDS`, two prompt files, and any small helpers the agent needs.

## Core flow

### Surface: `/add-integration` slash command in the built-in chat

```
/add-integration <module_name> [codebase|workspace]
```

- `module_name` — required, lowercase, becomes the module directory name.
- Source type — optional, defaults to `codebase`. Only effect: swaps a
  phrase in the generated prompt.

### Multi-turn flow, agent-driven

There is no backend state. All state lives in the chat thread itself —
the agent re-reads the conversation each turn and acts accordingly.

**Turn 1 — user invokes the command.** The frontend expands
`/add-integration <name> [source_type]` into the full `CommandDef.prompt`
and sends it to the chat agent. The prompt instructs the agent to:

1. Render the explainer (what a module is, what we need).
2. Render the canonical generation prompt with the module name
   substituted, in a copyable fenced code block.
3. Tell the user to run it elsewhere and paste the result back.

**Turn 2 — user pastes the generated markdown.** The same chat thread
continues. The agent (still running under the instructions seeded by
turn 1) recognizes the paste, parses the 6 sections itself, extracts
secret variable names from `## Auth & access`, detects non-conforming
example shapes (per the rules embedded in the command prompt), rewrites
them into `varlock run … -- sh -c 'uv run python -c "…"'` form, and
posts a review report with a diff of any rewritten examples.

**Turn 3 — `save`.** When the user confirms, the agent calls
`POST /api/modules` via its `Bash` tool (`curl`) with the final content
and the derived `.env.schema`, then reports the result.

If the user replies `keep original` or pastes a corrected version, the
agent loops back to validation without contacting the backend.

## The canonical 6-section template

Every `info.md` has exactly these top-level sections, in this order:

```markdown
# <Module Name>

## Purpose
Why this module exists for *this* project. Business / product context.

## Where it lives
Repo path(s), workspace URL, or account identifier. Environments touched.

## Auth & access
Environment variable NAMES only. One line per variable.

## Key entities
The nouns that matter in this project's usage. Real fields, real
conventions, real plan/status names.

## Operations
What an agent can/should do. Explicit "Never" items where there's risk.

## Examples
At least one runnable example using:

    varlock run --path ./<module> -- sh -c 'uv run python -c "..."'

### Python packages
Packages the examples import. One per line.
```

The order mirrors how an agent reads a module at runtime: orient → connect
→ understand data → act → copy a working example.

## Prompt files (single source of truth)

The agent-driven design uses **two markdown files** that the
`/add-integration` command prompt embeds (or instructs the agent to
read at runtime via its `Read` tool):

### `platform/src/prompts/add_module.md`

The canonical generation prompt the agent dispenses to the user in
turn 1. Documents the 6 sections, the rules ("auth lists names only",
"be concrete", "use project execution convention"), and the exact
varlock+uv example shape. Templated with `{{module_name}}` and
`{{source_type}}` — the substitution happens inside the agent's turn-1
output.

### `platform/src/prompts/adapt_examples.md`

A second markdown file containing the transformation rules the agent
applies in turn 2 when it detects non-conforming examples in the paste.
Same content as below; living in its own file means the rules are
visible, reviewable, and editable in one place rather than buried in
the command prompt string.

Transformation rules:

1. Wrap every Python snippet in `varlock run --path ./<module> -- sh -c
   'uv run python -c "..."'`.
2. Read every secret from `os.environ["VAR"]`. Escape inner double quotes
   as `\"` because the outer `sh -c` uses single quotes.
3. Remove `load_dotenv`, hardcoded secrets, `os.getenv("X", "default")`
   with real defaults, `--with` flags on `uv`.
4. For shell-only examples, wrap as `varlock run --path ./<module> -- sh
   -c '<command using $VAR>'`. Never `varlock run -- echo $VAR` directly.
5. For non-Python languages, keep the language but still wrap in `varlock
   run … -- sh -c '…'`.
6. Don't invent new examples. If an example references a secret not
   declared in `## Auth & access`, flag it with a comment.
7. Preserve the original example's intent and surrounding prose.

Both files are loaded into the agent's context via the command prompt
(either inlined verbatim or referenced for the agent to `Read`).
Editing the template, the section list, the rules, or the varlock
convention happens in **one place**.

## Review behavior (agent-performed)

The chat agent performs all review steps itself in turn 2, following
explicit instructions in the `/add-integration` command prompt. There
is no Python parser, no side channel, no backend state.

The command prompt instructs the agent to:

1. **Parse sections.** Look for the 6 required headings. If any are
   missing or look stub-like, ask the user to repaste rather than
   guessing.
2. **Extract secrets.** Read `## Auth & access`, collect `[A-Z_]+`
   tokens from bullet lines, present them as a candidate `.env.schema`.
3. **Detect non-conforming examples.** Flag any of:
   - Code block in `## Examples` not starting with `varlock run --path`
   - `load_dotenv` anywhere in the content
   - `os.getenv` / `os.environ[...]` reads outside a varlock wrapper
   - Bare `python <file>` or `python3 <file>` invocations
   - `--with` flags on `uv`
4. **Adapt examples in place.** Apply the transformation rules from
   `adapt_examples.md` and show a diff (old code block → new code
   block) for each rewritten snippet.
5. **Summarize and ask for confirmation.**

### Step 5: Review report

The agent posts a message:

```
✅ Purpose
✅ Where it lives
✅ Auth & access — found 1 secret: LINEAR_API_KEY
✅ Key entities
✅ Operations
⚠️ Examples — adapted 2 snippets to varlock convention (see diff below)
✅ Python packages — linear-sdk

[diff of old vs new Examples section]

I'll save this as module `linear` with the env schema above.
Reply `save` to confirm, `keep original` to skip adaptation,
or paste a corrected version.
```

## Validation philosophy

- **Warn, don't block** — except for the 6 required section headings,
  which hard-block (the parser can't reason about the file otherwise).
- **Never silently transform** the user's content beyond the example
  adaptation (which is explicit and shows a diff).
- **User stays in control** — `keep original` always available, even when
  examples don't conform.

## Failure modes

- Agent rewrites examples but the result still doesn't conform: agent
  surfaces a hard warning and asks the user to paste a corrected
  Examples section or `save anyway`.
- Agent can't find a required heading: surface the missing section,
  ask user to repaste.
- `POST /api/modules` save fails: agent shows the API error in chat
  and lets the user retry by replying `save` again — all the parsed
  state is in the conversation history.

## What changes

### New

- `platform/src/prompts/add_module.md` — canonical generation prompt.
- `platform/src/prompts/adapt_examples.md` — example adaptation rules.
- One new `CommandDef` entry in `platform/src/commands.py` named
  `add-integration`. Its `prompt` field embeds (or instructs the agent
  to read) the two prompt files and contains the full instructions for
  turn 1, turn 2 review, adaptation, and save.

### Reused

- The existing slash-command system in `platform/src/commands.py` and
  `platform/src/routes/commands.py`.
- The existing chat agent (`claude` subprocess) and its tools (Read,
  Write, Bash, Edit, Glob, Grep).
- `POST /api/modules` for the save (called by the agent via `Bash` +
  `curl`).
- All existing module CRUD endpoints and the Infisical/varlock pipeline.

### Removed / demoted

- The current "create module" form in `/modules`, if any, gets removed or
  hidden behind a "manual create" link. Chat is the primary entrypoint.

### Unchanged

- `/modules` route — list, browse, file explorer, inline editor, delete.
  Remains as the review/edit surface for existing modules.
- Module storage in the GitHub modules repo.
- Secret resolution via Infisical + varlock at module load time.

## Open questions

None blocking. Possible v2 work:

- A `claude` slash command (`.claude/commands/add-integration.md`) for
  users in their own Claude Code, generated from the same template file.
- A web UI surface that mirrors the chat flow for users who prefer forms.
- Source-type variants beyond `codebase` / `workspace`.
