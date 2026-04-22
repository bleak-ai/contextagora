# Context Agora — Developer Notes

## Prompt / Architecture Coupling

The files in `platform/src/prompts/` are tightly coupled to the project's runtime conventions.
Shared conventions are centralised in `_conventions.md` and auto-injected into all prompts.
**When any of the following change, update the prompts too:**

| What changed | Prompts to update |
|---|---|
| `varlock run` invocation, secret storage, execution convention | `_conventions.md` (single source — auto-injected into all prompts) |
| Module manifest format (`module.yaml` fields) | `_conventions.md` (module structure section), `add_integration.md` (SAVING section) |
| Module directory structure (`info.md`, `llms.txt`, `module.yaml`) | `_conventions.md` (module structure section) |
| Slash command flow logic (turns, phases) | The specific command's `.md` file in `prompts/` |
| Python execution convention (`uv run`, flags) | `_conventions.md` (varlock execution section) |

### Current conventions

All execution conventions now live in `platform/src/prompts/_conventions.md` — see that file for the authoritative reference.

## Session persistence

Chat history lives in two places:
1. **SQLite** at `settings.SESSIONS_DB_PATH` (default `~/.claude/contextagora/sessions.db`) — authoritative for anything streamed through this server. Written live as SSE events fire.
2. **Claude Code JSONL** at `~/.claude/projects/<encoded-cwd>/<id>.jsonl` — source of truth for `claude --resume`. Used as a fallback by the hydrate endpoint for sessions we didn't capture.

The Docker compose file mounts `/root/.claude` as a named volume so both persist across restarts.
