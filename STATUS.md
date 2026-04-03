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

## Project structure

```
platform/             ← everything that makes the app work
  pyproject.toml      ← dependencies, entry points, ruff config
  uv.lock
  .venv/
  src/                ← application source code (what gets deployed)
    server.py
    templates/index.html
    context/          ← runtime only, gitignored — agent works here
  deploy/             ← deployment config
    Dockerfile
    docker-compose.yml
fixtures/             ← sample modules for local dev/testing
  linear/             ← Linear integration module (info.md)
  supabase/           ← Supabase integration module (info.md)
docs/                 ← documentation
  ideas/              ← early design explorations
  plans/              ← enhancement plans
```

## Run

- Local: `cd platform && uv sync && uv run start`
- Docker: `cd platform/deploy && docker compose up --build`
- Start agent: `cd platform/src/context && claude`

## What's next (see docs/plans/)

- FileBrowser Quantum integration for visual file browsing
- Claude Code auto-start inside the container
- Per-module secrets via Varlock
- CLI selector with cmux multi-pane layout
- Module manifest schema (`module.yaml`) with validation
