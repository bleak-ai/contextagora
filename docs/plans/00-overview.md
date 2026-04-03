# Context Loader — What We're Building & Where Each Feature Fits

## The Big Picture

Context Loader is a system that gives AI coding agents (Claude Code, opencode, etc.) the right context for a task — documentation, integration guides, API references — without the user having to manually copy-paste or point the agent at random files.

Think of it as a **module loader for AI context**. A user picks what they're working on (e.g. "Linear integration" + "Supabase queries"), and the system assembles the relevant docs into a `/context/` directory the agent can read natively.

## What the POC Does Today

The current POC (`app.py`) is a FastAPI app with a minimal web UI:

- **Module picker** — checkboxes to select which context modules to load
- **Load endpoint** — copies selected modules from `modules/` into `context/`
- **Static file serving** — exposes `/context/` so files are browsable
- **API endpoint** — `GET /api/context` returns what's currently loaded

That's it. It proves the core idea works: select modules, copy files, agent reads them. Everything below builds on this foundation.
