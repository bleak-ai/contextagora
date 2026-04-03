# Deploy

## Overview

The context-loader runs as a Docker container that serves a FastAPI/uvicorn application on port 8080. It also includes Claude Code installed inside the container, configured to use glm models via a custom endpoint.

## Prerequisites

- Docker and Docker Compose
- A `.env` file in this directory (`platform/deploy/.env`)

## Setup

### 1. Create the `.env` file

Create `platform/deploy/.env` with your credentials:

```
ANTHROPIC_AUTH_TOKEN=your-auth-token
ANTHROPIC_BASE_URL=https://your-endpoint-url
```

The model configuration is set in `docker-compose.yml` and does not need to be in `.env`:
- Opus model: `glm-5.1`
- Sonnet model: `glm-5.1`
- Haiku model: `glm-5.1-flash`

### 2. Build and start the container

From `platform/deploy/`:

```bash
docker compose up -d --build
```

This builds the image (Python 3.12 + Node.js 22 + Claude Code) and starts the uvicorn server on port 8080.

### 3. Access Claude Code

With the container running, exec into it:

```bash
docker compose exec context-loader claude
```

Claude Code will use the glm models via the configured base URL.

## What's in the container

The Dockerfile installs:

- **Python 3.12** (base image)
- **uv** for Python dependency management
- **varlock** (v0.7.1) for secrets management
- **Node.js 22** and **Claude Code** (`@anthropic-ai/claude-code`)
- **git** (required by Claude Code)
- Application dependencies from `pyproject.toml` / `uv.lock`
- Application source from `platform/src/`

## Modules

Modules are loaded at runtime from a GitHub repo via the `GH_OWNER`, `GH_REPO`, and `GH_TOKEN` env vars. See `docs/guides/git-module-loading-test.md` for setup.

## Common commands

All commands should be run from `platform/deploy/`.

| Command | Description |
|---|---|
| `docker compose up -d --build` | Build and start |
| `docker compose down` | Stop and remove |
| `docker compose logs -f` | Follow logs |
| `docker compose exec context-loader claude` | Open Claude Code |
| `docker compose restart` | Restart after `.env` changes |
