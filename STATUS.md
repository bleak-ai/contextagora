# Context Agora — Status

## What it is

A **Context Management System**. Users create, edit, and load context modules into the system, then interact with an AI agent (Claude Code) that can read and act on the loaded context. Self-hosted as a Docker service, all interaction happens via the web UI at `:9090`.

The system has three parts:

1. **Chat** — interact with the AI based on the currently loaded context.
2. **Modules** — create, edit, browse, and manage the context modules themselves. Modules come in two kinds: **integrations** (third-party services like Linear, Slack) and **tasks** (short-lived work trackers with a `status.md`).
3. **Benchmarks** — test the loaded context against predefined prompts to answer: "did changing the context make the agent faster/smarter at this task?"

## How it's built

### Context storage and selection

Context modules live in a **git repository** (configurable via `GH_OWNER`, `GH_REPO`, `GH_BRANCH`). On startup, the repo is cloned into a local `modules-repo/` directory. All module reads, writes, and edits operate on this local clone — no per-request GitHub API calls.

There is a separate `context/` folder that acts as the agent's workspace. When the user selects which modules to load, the system **symlinks** each chosen module from `modules-repo/<name>` into `context/<name>`. This means:

- The agent only sees the modules you've selected — you control what Claude can access at any time.
- Edits the agent makes inside `context/` flow back into the local clone and surface as dirty git state, which you can review, push, or discard via the sync UI.
- Unloading a module is just removing the symlink.

A static `CLAUDE.md` in `context/` tells the agent to only use files within that directory.

### Third-party integrations and secrets

The main use case right now is giving the agent access to third-party services (Linear, Slack, etc.). Every module that integrates a service needs to define:

- **Secrets** (API keys, credentials) — declared in a `.env.schema` file with variable names only, no values.
- **Python packages** — listed in a `requirements.txt` so they can be installed in the system.

(In the future there will be context modules that are pure documentation with no secrets or packages, but currently all modules integrate something.)

Secret loading uses **Varlock + Infisical**. The key property: Claude can *use* the secrets (they're injected into each command's environment at runtime) but never *sees* the actual values in any file it can read. The module's `.env.schema` in the repo contains only variable names. At load time, the server augments the schema with Infisical connection details and writes the augmented version to `context/.schemas/` (outside the module dir, so the source schema is never mutated). At runtime, `varlock run` resolves values from Infisical, injects them for one command, and they're gone when the command exits. See `docs/varlock.md` for the full threat model and why this architecture matters.

### Tasks

Tasks are modules with `kind: task` in `module.yaml`. They share the same git repo, symlink workflow, and editor as integrations — only the scaffold differs. A new task gets `info.md` (title + description), `status.md` (dated, with a "Next Steps" checklist), and an `llms.txt` pointing at `status.md`. Tasks auto-load into the workspace on creation so the agent can start acting on them immediately.

Tasks can be archived — `archived: true` in the manifest hides them from the active list without deleting the files. The sidebar renders active tasks in their own zone above the integrations, with a separate modal for browsing archived tasks.

### Benchmarks

A PoC system for evaluating context quality. Each benchmark task is a YAML file with a prompt and a judge prompt. Running a benchmark:

1. Spawns a headless `claude -p` subprocess against the current `context/` workspace.
2. Parses the session transcript into a phase-by-phase timing table with token counts.
3. Asks a second `claude -p` call (the judge) whether the output satisfied the goal.
4. Writes a markdown report with timing breakdown, judge verdict, and the agent's final output.

The benchmark has **no concept of context** — it runs whatever workspace the user has loaded. Each run is tagged with a context fingerprint (sha256 hash of the `context/` tree) so runs against the same context are recognizable, but there's no built-in diff or comparison view. Comparing runs = eyeballing two browser tabs.

Tasks have a CRUD UI (create/edit/delete/download/upload). Runs are stored locally as markdown files and rendered in a two-column layout in the browser. Each report contains: session ID, context fingerprint, list of loaded modules, total wall time and token counts, judge verdict with reason, phase-by-phase breakdown table, and the agent's final output rendered as markdown.

### Chat

Streaming conversation with the Claude agent via SSE. The backend spawns a `claude` CLI subprocess with `--output-format stream-json` and pipes events to the frontend.

- **Empty-state card** — when there's no active chat, a card drives users into the product based on state. Three modes: **cold** (no modules in repo → "Get started" runs `/introduction`), **lukewarm** (modules exist but none loaded → prompts user to pick in sidebar), **warm** (modules loaded → "Show me" runs `/guide`). State comes from `/api/onboarding/state`.
- **Slash commands** — typing `/` opens a command selector. Five commands: `/download` (get files the agent wrote during the session), `/add-integration` (multi-turn wizard that creates a new integration module), `/introduction` (first-time explainer + picks first integration), `/guide` (tour of currently loaded modules with starter prompts), `/improve-integration <name>` (analyzes and rewrites an existing module). Commands are intercepted by the backend, which substitutes their prompt text from `src/prompts/commands/*.md` before reaching the Claude subprocess.
- **Suggestion pills (TRY markers)** — the agent emits `<<TRY: prompt>>` markers inline in its replies. A streaming parser (`SuggestionBuffer`) extracts complete markers out of text deltas before they reach the UI and emits them as `suggestion` SSE events, which render as clickable pills below the message.
- **System prompt injection** — for new (non-resumed) conversations, the backend appends the contents of `context/CLAUDE.md` via `--append-system-prompt`, so the root instructions are guaranteed to be in context regardless of the LLM backend.
- **@-mention file picker** — typing `@` in the composer opens a picker listing all files from loaded modules, grouped by module name. Inserting a mention references the file in the prompt.
- **Tool call display** — raw tool calls are translated to human-readable labels ("Read linear/info.md", "Searched for X", "Ran command"), with per-call timing and expandable input/output details.
- **Thinking display** — Claude's reasoning blocks are shown as collapsible/expandable sections with an animated spinner while streaming.
- **Decision tree** — a real-time panel showing which files the agent is reading during a conversation. Tree structure grouped by module, with pulsing indicators for active reads and access counts per module. Generated live during streaming, never persisted.
- **Session browser** — sidebar tab listing past Claude Code sessions by topic (extracted from the first user message in each session). The session *list* comes from Claude Code's on-disk JSONL files (`~/.claude/projects/`). Session *contents* (messages, tool calls) are served DB-first from a local SQLite store at `~/.claude/contextagora/sessions.db` — every SSE event the chat route streams is mirrored into the DB, so any client opening a session sees the full transcript regardless of which browser originally streamed it. Sessions the server didn't capture (CLI-created, pre-existing) fall back to parsing the JSONL. Both stores live under `~/.claude`, which the compose file mounts as a named Docker volume so history survives container redeploys.

### Module editor

Full CRUD for module content, files, secrets schemas, and package requirements. The editor opens in a modal (`ModuleEditorModal`) triggered from the sidebar — there are no dedicated routes per module.

- **File editor** — tabbed interface for editing `info.md` and `docs/*.md` files. Dirty state tracking with visual indicators. Add/delete files via modal dialog.
- **Secrets management** — add/remove secret key names (uppercase validated). The editor only manages the `secrets:` list in `module.yaml` (what secrets are needed), not the values.
- **Package requirements** — add/remove Python package names manually, or use **auto-detect** to have Claude analyze the module's `info.md` and suggest packages. Packages are stored under `dependencies:` in `module.yaml`.
- **Summary generation** — auto-generate a 1-2 sentence summary from the module's `info.md` content using a Claude subprocess call.
- **Create via modal OR chat** — a `CreateModuleModal` lets users scaffold a new integration directly from the sidebar. The chat path (`/add-integration`) remains for richer, conversational creation.
- **Register endpoint** — `POST /api/modules/{name}/register` accepts a module already written to disk (agent writes `info.md` + `module.yaml` via the `Write` tool, then registers). This generates `llms.txt`, re-reads the manifest, and auto-loads non-integration modules.
- **Per-module dependency install** — loaded modules expose an "Install deps" button that calls `POST /api/workspace/{name}/install-deps`. Install is decoupled from load — symlinking is instant, package install is explicit.

### Context sidebar

A resizable three-tab panel on the right side of the UI (width persisted to localStorage). The footer shows the running build version (`VITE_APP_VERSION`, baked in at Docker build time).

- **Context tab** — split into two zones:
  - **Active Tasks** (top) — cards for every `kind: task` module that isn't archived. Each card exposes edit / archive / delete actions. Empty state offers a "+ New" button; a separate "Archive ↗" modal lists archived tasks with an unarchive action.
  - **Workspace** (bottom) — a collapsible `WorkspaceGroup` with a health dot (green = all loaded modules have secrets resolved and packages installed; red = at least one is missing; grey = nothing loaded). Expanding reveals a **Root Files** sub-row (`CLAUDE.md`, `llms.txt` with preview modals), then a list of integration `ModuleCard`s (loaded first, then idle). Footer has "+ New Integration" and a "Re-check" button that re-queries Infisical for secret status.
- **Tree tab** — the decision tree visualization (see Chat section above).
- **Sessions tab** — the session browser (see Chat section above).

### Prompts

Slash-command prompts live as markdown files, not inline Python strings. Layout:

- `platform/src/prompts/_conventions.md` — single source of truth for varlock invocation, file-based credentials, secret paths, TRY-marker syntax, module structure, and `module.yaml` fields. Auto-injected into any prompt that has a `{conventions}` placeholder.
- `platform/src/prompts/commands/*.md` — one file per slash command (`add_integration`, `download`, `guide`, `improve_integration`, `introduction`).
- `platform/src/prompts/templates/*.md` — reusable fragments used by module generation flows.
- `{base_url}` is substituted with the running server URL at load time, so prompts can reference API endpoints without hardcoding ports.

### LLM backend

The chat subprocess supports non-Anthropic Claude-compatible backends. Three env vars — `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` — are mapped at spawn time to `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and the three `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` vars. This lets deployers route the CLI through OpenRouter, LiteLLM, or a self-hosted proxy without forking the backend.

## Current state

Working product. FastAPI backend + React SPA frontend (Vite + TanStack Router + TanStack Query). Deployed via Docker; the repo is a monorepo with `platform/` (backend + frontend) and `landing/` (marketing site). Module management, chat, and benchmarks are all functional. Sync UI for git push/pull to the module repo is working. A CLI linter (`platform/src/scripts/validate_modules.py`) validates all modules in `modules-repo/` against project conventions.
