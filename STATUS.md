# Context Loader — Status

## What it is

A system that lets users select "context modules" (curated docs, configs, API references) and load them into a workspace where a coding agent (Claude Code, etc.) can read and act on them.

## Current state: Minimal POC

Single FastAPI app with a web UI. User checks modules from a list, clicks Load, modules get copied to `platform/src/context/`. A `CLAUDE.md` is auto-generated listing loaded modules so the agent knows what's available.

## How it works

1. Modules are structured folders with a single `info.md` file containing all documentation. In production they'll live in a separate repo. For local dev, sample modules are in `fixtures/`.
2. `platform/src/server.py` serves a picker UI at `:8080`. Three endpoints:
   - `GET /` — renders checkbox list of available modules, shows which are loaded
   - `POST /load` — clears context, copies selected modules, generates `CLAUDE.md`
   - `GET /api/context` — returns loaded module names as JSON
3. `platform/src/context/` is the runtime output directory (gitignored). This is what agents read from.
4. A static `CLAUDE.md` lives in `context/` instructing the agent to only use files within that directory. The agent starts here.
5. `MODULES_DIR` is configurable via env var (defaults to `../../fixtures` relative to `src/`).

## Secret management

Module secrets (API keys, credentials) are managed via **Infisical** and resolved at runtime by **Varlock**. Modules don't know about Infisical — the platform injects the connection at load time.

### How it works

1. Modules declare what secrets they need in a simple `.env.schema`:
   ```
   # @required @sensitive @type=string
   LINEAR_API_KEY=
   ```
2. When a module is loaded via the UI, `server.py` augments its `.env.schema` in `context/` — prepending the `@varlock/infisical-plugin` config, `@initInfisical(...)` with platform credentials, and rewriting `KEY=` → `KEY=infisical()`.
3. Varlock reads the augmented schema, connects to Infisical using bootstrap credentials (passed as container env vars), and fetches the secret values.
4. The original module `.env.schema` in `fixtures/` stays clean and portable.

### Key files

- `platform/src/.env.schema` — declares the Infisical bootstrap credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENVIRONMENT`). Imported by augmented module schemas via `@import(../../.env.schema)`.
- `platform/src/server.py` → `augment_schema()` — transforms module schemas at load time.
- `platform/deploy/docker-compose.yml` — passes Infisical bootstrap credentials + `INFISICAL_SITE_URL` to the container.

### Convention

Secrets in Infisical are organized by module name: module `linear` → Infisical path `/linear`. The `secretPath` is derived automatically from the module directory name.

### Configuration

Infisical credentials are provided via env vars (`.envrc` for local dev, `platform/deploy/.env` for Docker):

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
platform/             ← everything that makes the app work
  pyproject.toml      ← dependencies, entry points, ruff config
  uv.lock
  .venv/
  src/                ← application source code (what gets deployed)
    server.py
    .env.schema       ← Infisical bootstrap credentials (imported by modules)
    templates/index.html
    context/          ← runtime only, gitignored — agent works here
  deploy/             ← deployment config
    Dockerfile
    docker-compose.yml
fixtures/             ← sample modules for local dev/testing
  linear/             ← Linear integration module (info.md, .env.schema)
  supabase/           ← Supabase integration module (info.md, .env.schema)
docs/                 ← documentation
  guides/             ← setup guides (Infisical, etc.)
  ideas/              ← early design explorations
  plans/              ← enhancement plans
```

## Run

- Local: `cd platform && uv sync && uv run start` (requires Infisical env vars in `.envrc`)
- Docker: `cd platform/deploy && docker compose up --build` (requires `.env` with credentials)
- Start agent: `cd platform/src/context && claude`

## What's next (see docs/plans/)

- FileBrowser Quantum integration for visual file browsing
- Claude Code auto-start inside the container
- CLI selector with cmux multi-pane layout
- Module manifest schema (`module.yaml`) with validation
