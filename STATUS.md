# Context Agora — Status

## What it is

A **Context Management System**. Users create, edit, and load context modules into the system, then interact with an AI agent (Claude Code) that can read and act on the loaded context. Self-hosted as a Docker service, all interaction happens via the web UI at `:8080`.

The system has three parts:

1. **Chat** — interact with the AI based on the currently loaded context.
2. **Modules** — create, edit, browse, and manage the context modules themselves.
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

- **Slash commands** — typing `/` opens a command selector. Two commands: `/download` (get files the agent wrote during the session) and `/add-integration` (multi-turn wizard that creates a new module from chat). Commands are intercepted by the backend before reaching the Claude subprocess.
- **@-mention file picker** — typing `@` in the composer opens a picker listing all files from loaded modules, grouped by module name. Inserting a mention references the file in the prompt.
- **Tool call display** — raw tool calls are translated to human-readable labels ("Read linear/info.md", "Searched for X", "Ran command"), with per-call timing and expandable input/output details.
- **Thinking display** — Claude's reasoning blocks are shown as collapsible/expandable sections with an animated spinner while streaming.
- **Decision tree** — a real-time panel showing which files the agent is reading during a conversation. Tree structure grouped by module, with pulsing indicators for active reads and access counts per module. Generated live during streaming, never persisted.
- **Session browser** — sidebar tab listing past Claude Code sessions by topic (extracted from the first user message in each session). Sessions are read directly from Claude Code's on-disk JSONL files (`~/.claude/projects/`), no separate session store. Users can switch between sessions.

### Module editor

Full CRUD for module content, files, secrets schemas, and package requirements.

- **File editor** — tabbed interface for editing `info.md` and `docs/*.md` files. Dirty state tracking with visual indicators. Add/delete files via modal dialog.
- **Secrets management** — add/remove secret key names (uppercase validated). The editor only manages the schema (what secrets are needed), not the values.
- **Package requirements** — add/remove Python package names manually, or use **auto-detect** to have Claude analyze the module's `info.md` and suggest packages.
- **Summary generation** — auto-generate a 1-2 sentence summary from the module's `info.md` content using a Claude subprocess call.

### Context sidebar

A resizable three-tab panel on the right side of the UI (width persisted to localStorage):

- **Context tab** — root section at the top showing `CLAUDE.md` and root `llms.txt` (with file preview modals), distinct from loadable modules. Below that, module selection with checkboxes, load/unload controls, and per-module status showing files, secrets (with Infisical availability), and installed packages with versions.
- **Tree tab** — the decision tree visualization (see Chat section above).
- **Sessions tab** — the session browser (see Chat section above).

## Current state

Working product. FastAPI backend + React SPA frontend (Vite + TanStack Router + TanStack Query). Deployed via Docker. Module management, chat, and benchmarks are all functional. Sync UI for git push/pull to the module repo is working.
