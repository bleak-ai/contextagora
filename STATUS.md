# Context Loader — Status

## What it is

A system that lets users select "context modules" (curated docs, configs, API references) and load them into a workspace where a coding agent (Claude Code, etc.) can read and act on them.

## Current state: Minimal POC

Single FastAPI app with a web UI. User checks modules from a list, clicks Load, modules get copied to `product/src/context/`. Agent reads from there.

## How it works

1. Modules are structured folders with `info.md`, `llms.txt`, and `docs/`. In production they'll live in a separate repo. For local dev, sample modules are in `fixtures/`.
2. `product/src/server.py` serves a picker UI at `:8080`. Three endpoints:
   - `GET /` — renders checkbox list of available modules, shows which are loaded
   - `POST /load` — clears context, copies selected modules into it
   - `GET /api/context` — returns loaded module names as JSON
3. `product/src/context/` is the runtime output directory (gitignored). This is what agents read from.
4. `MODULES_DIR` is configurable via env var (defaults to `../../fixtures` relative to `src/`).

## Project structure

```
product/              ← everything that makes the app work
  pyproject.toml      ← dependencies, entry points, ruff config
  uv.lock
  .venv/
  src/                ← application source code (what gets deployed)
    server.py
    templates/index.html
    context/          ← runtime only, gitignored
  deploy/             ← deployment config
    Dockerfile
    docker-compose.yml
fixtures/             ← sample modules for local dev/testing
  linear/
  sqlite/
docs/                 ← documentation
  ideas/              ← early design explorations
  plans/              ← enhancement plans
```

## Run

- Local: `cd product && uv sync && uv run start`
- Docker: `cd product/deploy && docker compose up --build`

## What's next (see docs/plans/)

- FileBrowser Quantum integration for visual file browsing
- Claude Code auto-start inside the container
- Per-module secrets via Varlock
- CLI selector with cmux multi-pane layout
- Module manifest schema (`module.yaml`) with validation
