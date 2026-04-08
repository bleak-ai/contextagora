# Context Loader — Status

## What it is

A self-hosted web application that lets users select "context modules" (curated docs, configs, API references) through a browser UI, load them into a workspace, and chat with a coding agent (Claude Code) that can read and act on the loaded context. Designed to run as a Docker service — users interact entirely via the web UI at `:8080`.

## Current state: Working product

FastAPI backend + React SPA frontend with a full chat interface and module management system. Users can browse/create/edit modules, load them into the workspace, and have streaming conversations with Claude through the built-in chat UI. Modules are fetched from GitHub, secrets are injected via Infisical/Varlock.


## How it works

1. Modules are structured folders with an `info.md` file and optional additional docs. They live in a separate GitHub repo (e.g. `bleak-ai/context-loader-module-demo`).
2. On startup, that repo is cloned once into `platform/src/modules-repo/` (configurable via `MODULES_REPO_DIR`). All module reads/writes go to this local clone — no GitHub Contents API calls per request.
3. `platform/src/server.py` exposes a JSON API at `:8080` and serves the React SPA as static files.
4. `platform/src/context/` is the runtime workspace the agent reads from (gitignored). Workspace load **symlinks** each selected module from the clone into `context/<name>` — there's no copy. Agent edits inside `context/` flow directly back into the local clone and surface as dirty git state in the sync UI.
5. A static `CLAUDE.md` lives in `context/` instructing the agent to only use files within that directory. The agent starts here.
6. Module source is configured via `GH_OWNER`, `GH_REPO`, and `GH_BRANCH` env vars.

### API endpoints

**Chat** (`routes/chat.py`):
- `POST /api/chat` — streams Claude responses as SSE (thinking, text, tool calls, tool results)
- `GET /api/chat/session` — returns current session ID
- `POST /api/chat/reset` — resets the conversation session

**Workspace** (`routes/workspace.py`):
- `GET /api/workspace` — returns loaded modules and their secrets status
- `POST /api/workspace/load` — clears context, downloads selected modules, generates `CLAUDE.md`, injects secrets
- `POST /api/workspace/secrets` — re-checks secrets status from Infisical

**Modules** (`routes/modules.py`) — all operate on the local clone:
- `GET /api/modules` — lists modules from the local clone (always fresh, no cache)
- `GET /api/modules/{name}` — module detail (info.md content, summary, secrets schema, requirements)
- `POST /api/modules` — create new module (writes to local clone)
- `PUT /api/modules/{name}` — update module content/summary/secrets/requirements
- `DELETE /api/modules/{name}` — delete module directory from the local clone
- `POST /api/modules/refresh` — kept for frontend compatibility; same as list
- `POST /api/modules/{name}/generate` — uses Claude to generate a summary from info.md
- `POST /api/modules/{name}/detect-packages` — uses Claude to detect Python deps
- `GET /api/modules/{name}/files` — list files in module
- `GET/PUT/DELETE /api/modules/{name}/files/{path}` — file CRUD (auto-regenerates `llms.txt`)

**Sync** (`routes/sync.py`) — git round-trip with the GitHub remote:
- `GET /api/sync/status` — `git fetch` + reports `dirty`, `ahead`, `behind`, `can_pull`, `can_push`
- `POST /api/sync/pull` — hard-resets local clone to remote (discards local changes — "remote always wins")
- `POST /api/sync/push` — stages all changes, commits with the supplied message, and pushes. Refuses if remote is ahead (must pull first).

**Health** (`routes/health.py`):
- `GET /api/health` — Docker health check

## Chat UI

The web app includes a built-in chat interface for talking to the Claude agent. The agent runs as a `claude` subprocess on the backend, streaming responses via SSE.

**Features:**
- Real-time streaming with thinking/reasoning display (animated, collapsible)
- Tool call visualization — humanized labels ("Read", "Searched", "Ran command"), file names, duration timing, expandable input/output
- Session management — conversations persist in localStorage and can be resumed via session ID on the backend
- Markdown rendering (GitHub-flavored) for assistant responses
- Cancel in-flight requests

**Architecture:**
- `useChatStore` (Zustand) — manages messages, streaming state, session ID, abort controller. Persisted to localStorage.
- `useContextChatRuntime` — adapter that bridges the Zustand store to `@assistant-ui/react` primitives via `useExternalStoreRuntime`
- Messages use a parts-based structure: each message contains `parts[]` with text or tool call entries (including timing metadata)
- UI built with `@assistant-ui/react` composable primitives (`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`)

## Module management

Beyond loading modules, the UI supports full CRUD for module content:

- **Create** modules with name, summary, info.md content, and optional secrets schema
- **Browse & edit** files within a module (inline markdown editor, auto-saves)
- **Create/delete** additional doc files (in `docs/` subdirectory)
- **Inline summary editing** (extracted from/written to `llms.txt`)
- **Secrets management** — define `.env.schema` entries, see which secrets are set in Infisical vs missing
- **Delete** modules entirely from the GitHub repo

Managed files (`llms.txt`, `.env.schema`) are auto-generated and not user-editable. `CLAUDE.md` is preserved across module reloads.

## Module loading (local git clone + symlinks)

Modules live in a local git clone of the configured GitHub repo, managed by `platform/src/services/git_repo.py`. All listing, reading, and editing happens against the local working tree — no per-request GitHub API calls.

- On startup the repo is cloned (single-branch, shallow checkout of `GH_BRANCH`) into `platform/src/modules-repo/`
- All module CRUD writes to this working tree directly; changes are uncommitted until the user explicitly pushes
- The user can edit modules in the UI, then commit + push back to GitHub via `POST /api/sync/push`
- `POST /api/sync/pull` hard-resets local to remote (discards local changes — "remote always wins" by design)
- **Workspace load symlinks** each selected module from `modules-repo/<name>` into `context/<name>` — there's no copy. Edits the agent makes inside `context/<name>/...` are edits to the clone and surface immediately as dirty git state in `GET /api/sync/status`. The user reviews/pushes/discards them via the existing sync flow.
- Augmented `.env.schema` files (with Infisical wiring) are written to a sibling path `context/.schemas/<name>.env.schema` so the source `.env.schema` in the clone is never mutated. See "Secret management" below.
- Auth via `GH_TOKEN` (fine-grained PAT with Contents read/write); embedded in the clone URL as `x-access-token`

### Configuration

GitHub module loading is configured via env vars (`.envrc` for local dev, `.env` for Docker):

```
GH_OWNER=bleak-ai
GH_REPO=context-loader-module-demo
GH_BRANCH=main           # optional, defaults to main
GH_TOKEN=github_pat_...  # needs Contents read/write to enable push
```

## Secret management

Module secrets (API keys, credentials) are managed via **Infisical** and resolved at runtime by **Varlock**. Modules don't know about Infisical — the platform injects the connection at load time.

### How it works

1. Modules declare what secrets they need in a simple `.env.schema`, written to the local clone at `modules-repo/<name>/.env.schema`:
   ```
   # @required @sensitive @type=string
   LINEAR_API_KEY=
   ```
   This is the **clean source schema** — portable, deployment-agnostic, and the only version that ever gets pushed back to GitHub. Editing secrets via `PUT /api/modules/{name}` writes here.
2. When a module is loaded into the workspace, `api_workspace_load` reads the source schema from the clone, runs `augment_schema()` to inject the `@varlock/infisical-plugin` config, `@initInfisical(...)` with platform credentials, and rewrites `KEY=` → `KEY=infisical()`. The result is written to a **sibling path** `context/.schemas/<name>.env.schema` — *not* into the symlinked module dir. The source schema in `modules-repo/` is never touched.
3. Varlock loads `context/.schemas/<name>.env.schema`, connects to Infisical using bootstrap credentials (passed as container env vars), and fetches the secret values.
4. Because the augmented schema lives outside the module dir, the symlink from `context/<name>` to `modules-repo/<name>` stays safe — agent edits flow to the clone, but the deployment-specific Infisical wiring never leaks back into git.

**Where things end up when you add a secret via the UI:**

| File | Path | Lifetime |
|---|---|---|
| Clean source schema | `platform/src/modules-repo/<name>/.env.schema` | Persistent — committed and pushed to GitHub |
| Augmented schema | `platform/src/context/.schemas/<name>.env.schema` | Regenerated on every workspace load — never committed |

### Key files

- `platform/src/.env.schema` — declares the Infisical bootstrap credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENVIRONMENT`). Imported by augmented module schemas via `@import(../../.env.schema)`.
- `platform/src/services/schemas.py` → `augment_schema()` — transforms module schemas at load time. Called from `api_workspace_load` in `routes/workspace.py`; output is written to `context/.schemas/<name>.env.schema`.
- `docker-compose.yml` — passes Infisical bootstrap credentials + `INFISICAL_SITE_URL` to the container.

### Convention

Secrets in Infisical are organized by module name: module `linear` → Infisical path `/linear`. The `secretPath` is derived automatically from the module directory name.

### Configuration

Infisical credentials are provided via env vars (`.envrc` for local dev, `.env` for Docker):

```
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=dev
INFISICAL_SITE_URL=https://eu.infisical.com   # or https://app.infisical.com for US
```

See `docs/guides/infisical-setup.md` for full setup instructions.

## Project structure

```
docker-compose.yml    ← single compose file (pulls image or builds with --build)
.env.example          ← credential template for self-hosted deployment
.github/workflows/    ← CI: auto-publish image to GHCR
platform/             ← everything that makes the app work
  pyproject.toml      ← dependencies, entry points, ruff config
  uv.lock
  .venv/
  src/                ← application source code (what gets deployed)
    server.py         ← FastAPI app, SPA static file serving
    routes/           ← API route modules (chat, modules, workspace, health)
    .env.schema       ← Infisical bootstrap credentials (imported by modules)
    context/          ← runtime only, gitignored — agent works here
  frontend/           ← React SPA (Vite + TanStack Router + TanStack Query)
    src/
      api/            ← API client layer (fetch wrapper, typed API functions)
      components/     ← React components (Sidebar, Chat, ModuleRegistry, etc.)
        chat/         ← Chat UI (Thread, ToolCallDisplay, ThinkingDisplay, MarkdownText)
      hooks/          ← State management (useChatStore, useContextChatRuntime)
      utils/          ← Utilities (humanizeToolCall)
      routes/         ← TanStack Router file-based routes (/, /modules)
Dockerfile            ← multi-stage container image (Node build + Python runtime)
docs/                 ← documentation
  guides/             ← setup guides (Infisical, GitHub module loading)
  plans/              ← enhancement plans
```

## Run

Primary deployment is Docker-based. The web UI at `:8080` is the main user interface.

- Self-host: `cp .env.example .env && docker compose up -d` (fills creds, pulls published image)
- Build from source: `docker compose up -d --build`
- Update: `docker compose pull && docker compose up -d`
- Local dev (non-Docker): `cd platform && uv sync && uv run start` (requires env vars in `.envrc`)
- Start agent: `cd platform/src/context && claude`

## What's next (see docs/plans/)

- FileBrowser Quantum integration for visual file browsing
- Claude Code auto-start inside the container
- CLI selector with cmux multi-pane layout
- Module manifest schema (`module.yaml`) with validation
