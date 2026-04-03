# Context Loader

## Run locally

```bash
cd platform
uv sync
uv run start
```

Open http://localhost:8080

## Run with Docker

Set your Anthropic API key and run:

```bash
export ANTHROPIC_AUTH_TOKEN=your-key-here
cd platform/deploy
docker compose up --build
```

Open http://localhost:8080

The container includes Python 3.12, Node.js 22, Claude Code, Varlock, and Git. It mounts `fixtures/` as the modules directory and serves the app on port 8080.

## Test with Claude Code

1. Start the server (locally or with Docker)
2. Open http://localhost:8080 and select the modules you want to load
3. Open Claude Code from the context directory:
   ```bash
   cd platform/src/context
   claude
   ```
4. Claude will read the `CLAUDE.md` in that directory and work only with the loaded modules
