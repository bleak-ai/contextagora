# Context Loader

## Self-host with Docker

```bash
cp .env.example .env   # fill in your credentials
docker compose up -d
```

Open http://localhost:8080

Update to latest version:

```bash
docker compose pull && docker compose up -d
```

The container includes Python 3.12, Node.js 22, Claude Code, Varlock, and Git. Modules are loaded from GitHub at runtime via the `GH_OWNER`/`GH_REPO`/`GH_TOKEN` env vars.

## Run locally (development)

```bash
cd platform
uv sync
uv run start
```

To build from source with Docker:

```bash
docker compose up -d --build
```

## Test with Claude Code

1. Start the server (locally or with Docker)
2. Open http://localhost:8080 and select the modules you want to load
3. Open Claude Code from the context directory:
   ```bash
   cd platform/src/context
   claude
   ```
4. Claude will read the `CLAUDE.md` in that directory and work only with the loaded modules
