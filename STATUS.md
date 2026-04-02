# Context Loader — Status

## What it is

A system that lets users select "context modules" (curated docs, configs, API references) and load them into a workspace where a coding agent (Claude Code, etc.) can read and act on them.

## Current state: Minimal POC

Single FastAPI app with a web UI. User checks modules from a list, clicks Load, modules get copied to `app/context/`. Agent reads from there.

## How it works

1. `modules/` contains available modules (the registry). Each module is a folder with `info.md`, `llms.txt`, and `docs/`.
2. `app/server.py` serves a picker UI at `:8080`. Three endpoints:
   - `GET /` — renders checkbox list of available modules, shows which are loaded
   - `POST /load` — clears `app/context/`, copies selected modules into it
   - `GET /api/context` — returns loaded module names as JSON
3. `app/context/` is the runtime output directory (gitignored). This is what agents read from.
4. `MODULES_DIR` is configurable via env var (defaults to `../modules` relative to `app/`). Docker sets it to `/app/modules`.

## Project structure

```
app/                  ← deployable application
  server.py           ← FastAPI app (~60 lines)
  templates/index.html
  Dockerfile
  docker-compose.yml
  context/            ← runtime only, gitignored
modules/              ← module registry
  linear/             ← sample module
  sqlite/             ← sample module
plans/                ← enhancement plans (not deployed)
ideas/                ← early design docs
```

## Run

- Local: `uv sync && uv run start`
- Docker: `cd app && docker compose up --build`

## What's next (see plans/)

- FileBrowser Quantum integration for visual file browsing
- Claude Code auto-start inside the container
- Per-module secrets via Varlock
- CLI selector with cmux multi-pane layout
