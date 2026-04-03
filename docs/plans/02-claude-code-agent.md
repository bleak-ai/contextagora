# Plan: Claude Code Agent Auto-Start

## Goal

Have Claude Code running inside the container so that after loading modules, the user can immediately chat with an agent that has access to `/context/`.

## What changes

1. **Install Claude Code in the Dockerfile**
   - Install Node.js (required runtime)
   - Install `@anthropic-ai/claude-code` globally via npm

2. **Add a `CLAUDE.md`** at `/app/context/` that tells Claude to read from the context directory
   - Generated dynamically when modules are loaded (lists what's available)

3. **Add a web terminal** to the UI so users can interact with Claude Code from the browser
   - Use `ttyd` (tiny web terminal) as the simplest option — single binary, exposes a shell on a port
   - Or: user just `docker exec`s in (even simpler, no ttyd needed)

4. **Update the `/load` endpoint** to generate a `CLAUDE.md` in `/app/context/` listing loaded modules and their `llms.txt` paths.

## File changes

```
Dockerfile           — install node, claude-code, ttyd
docker-compose.yml   — expose ttyd port (8082)
app.py               — generate CLAUDE.md on module load
```

## Dockerfile additions

```dockerfile
RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
RUN npm install -g @anthropic-ai/claude-code

# Optional: web terminal
RUN apt-get install -y ttyd
```

## Generated CLAUDE.md example

```markdown
# Context

The following modules are loaded in /app/context/:

- linear/ — see linear/llms.txt for navigation
- supabase/ — see supabase/llms.txt for navigation

Read the llms.txt in each module before answering questions.
```

## Simplest version (no ttyd)

Skip ttyd entirely. User does:
```bash
docker exec -it poc-context-loader-1 bash
export ANTHROPIC_API_KEY=sk-...
claude
```
Claude Code starts, sees `/app/context/CLAUDE.md`, reads modules.

## Verification

1. Load modules via picker
2. Exec into container, run `claude`
3. Ask: "What modules are available?" — agent should list them
4. Ask: "Show me the Supabase schema" — agent should read from context

## Out of scope

- Persistent chat history
- API key management (user provides manually)
- Multi-user sessions
