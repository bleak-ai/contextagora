# 17 — Agent Backend Abstraction (Claude Code ↔ opencode)

## Motivation

Today the chat pipeline is hard-wired to Claude Code: `routes/chat.py` spawns
`claude` directly, parses Claude's `stream-json` event schema, and
`services/claude_sessions.py` reads `~/.claude/projects/<encoded-cwd>/*.jsonl`.
The agent instructions file is `CLAUDE.md`, the tool allow-list uses Claude
Code's tool names, and the frontend humanizer keys off those names.

We want the option to swap in **opencode** (or any future CLI agent) without
forking the platform. The cleanest way is to introduce an `AgentBackend`
abstraction with `claude` and `opencode` implementations, selected via env var.

## Goals

- One env var (`AGENT_BACKEND=claude|opencode`, default `claude`) chooses the
  runtime agent. No code changes required to swap.
- `routes/chat.py` knows nothing about Claude or opencode specifics — it only
  speaks normalized SSE events to the frontend.
- Session listing, resume, and the tree-navigation feature work for both
  backends (where the backend supports them; degrade gracefully where it
  doesn't).
- Frontend tool rendering survives a backend swap (tool names normalized at
  the backend boundary, not in the UI).

## Non-goals

- Running both backends simultaneously in one container.
- Replicating Claude Code's `CLAUDE.md` semantics 1:1 inside opencode if
  opencode doesn't support them — we'll write whichever instruction file each
  backend reads.
- Building a TUI scraper if opencode doesn't expose a structured non-interactive
  mode (see Risks).

## Current coupling — concrete inventory

| Where | What's Claude-specific |
|---|---|
| `platform/src/routes/chat.py` | `claude -p ... --output-format stream-json --include-partial-messages --allowedTools Bash(*) Read(*) ...`; parses `system` / `stream_event` / `assistant` / `user` / `result` events; `thinking_delta`, `text_delta`, `input_json_delta`, `tool_use`, `tool_result` shapes; `--resume <session_id>`. |
| `platform/src/services/claude_sessions.py` | Reads `~/.claude/projects/<encoded-cwd>/*.jsonl`; first-user-message extraction assumes Claude's JSONL message shape. |
| `platform/src/context/CLAUDE.md` (generated) | Claude Code instruction filename + format. |
| `platform/src/routes/workspace.py` (CLAUDE.md generation) | Hard-coded path/name. |
| `frontend/src/utils/humanizeToolCall.ts` | Maps Claude tool names (`Read`, `Edit`, `Bash`, …) to human labels. |
| `frontend/src/components/chat/ToolCallDisplay.tsx` | Renders the parts schema produced from Claude's events. |
| `routes/chat.py` tree-navigation | Keys specifically off `tool_name == "Read"` and `file_path` input field. |

## Proposed architecture

### Normalized event schema (the contract)

The frontend already consumes a small set of SSE events. Lock these down as
the *backend-agnostic* contract:

- `session  { session_id }`
- `thinking { text }`           — incremental
- `text     { text }`           — incremental assistant text
- `tool_use { tool, tool_id, input }`
- `tool_input { tool_id, partial_json }`  *(optional, only if backend streams it)*
- `tool_result { tool_id, output }`
- `tree_navigation { active_path, accessed_files, module_counts }`
- `error    { message }`
- `done     {}`

Tool names in `tool_use` are normalized to a canonical set:
`read`, `write`, `edit`, `bash`, `glob`, `grep`, `web_fetch`, `other`.
Each backend maps its native tool names into this set. The frontend humanizer
switches to the canonical names (one-time edit).

### `AgentBackend` interface

New module: `platform/src/agents/__init__.py` exposing:

```python
class AgentBackend(Protocol):
    name: str
    instructions_filename: str   # "CLAUDE.md" or "AGENTS.md" etc.

    def spawn(
        self,
        prompt: str,
        cwd: Path,
        session_id: str | None,
    ) -> Iterator[NormalizedEvent]: ...

    def list_sessions(self, cwd: Path) -> list[SessionInfo]: ...
```

`NormalizedEvent` is a small dataclass / TypedDict matching the SSE schema
above. The backend is responsible for spawning its CLI, parsing its native
output, and yielding normalized events. `routes/chat.py` becomes ~30 lines:
call `backend.spawn(...)`, serialize each event to SSE, done.

### Concrete backends

```
platform/src/agents/
  __init__.py          # AgentBackend protocol, NormalizedEvent, get_backend()
  claude_backend.py    # current logic moved here
  opencode_backend.py  # new
  tool_normalize.py    # name → canonical mapping per backend
```

`get_backend()` reads `AGENT_BACKEND` env var (default `claude`) and returns
the singleton. Unknown values raise at startup.

### Session storage

- **claude**: keep `services/claude_sessions.py` as-is, called from
  `claude_backend.list_sessions`.
- **opencode**: implement `list_sessions` against opencode's session store
  (TBD — see Risks). If opencode has no equivalent, return `[]` and disable
  the session sidebar for that backend (frontend already handles empty list).

### Instructions file

`workspace.py` currently writes `context/CLAUDE.md`. Change it to write
`context/<backend.instructions_filename>`. For `claude` this stays
`CLAUDE.md`; for `opencode` it becomes whatever opencode reads (likely
`AGENTS.md` or similar — verify). Module loading is otherwise unchanged.

### Frontend changes

- `humanizeToolCall.ts`: switch the lookup table to canonical names
  (`read`, `bash`, …). One-line per tool.
- `ToolCallDisplay.tsx`: no schema change — still consumes the same parts.
- Tree-navigation logic moves server-side anyway (already is); just key off
  canonical `tool == "read"` instead of `"Read"`.

## Implementation plan

1. **Define the contract** (no behavior change)
   - Add `platform/src/agents/__init__.py` with `NormalizedEvent`,
     `SessionInfo`, `AgentBackend` Protocol.
   - Add `tool_normalize.py` with the canonical name set.

2. **Extract Claude backend** (pure refactor, behavior identical)
   - Move the body of `routes/chat.py`'s `generate()` into
     `agents/claude_backend.py` as `ClaudeBackend.spawn()`, yielding
     `NormalizedEvent`s instead of pre-formatted SSE strings.
   - Map Claude tool names → canonical names at the backend boundary.
   - Move `services/claude_sessions.py` call into
     `ClaudeBackend.list_sessions()`.
   - `routes/chat.py` shrinks to: pick backend, iterate events, serialize SSE.
   - `routes/chat.py` `/api/sessions` calls `backend.list_sessions(CONTEXT_DIR)`.
   - Frontend humanizer: rename keys to canonical.
   - **Verify**: full chat flow still works end-to-end with `AGENT_BACKEND`
     unset (default claude). Tree nav, resume, sessions sidebar all unchanged.

3. **Generalize the instructions file**
   - `workspace.py`: write to `backend.instructions_filename`.
   - Keep `CLAUDE.md` for the default backend so existing users see no diff.

4. **Implement opencode backend**
   - Research first (see Risks): confirm opencode exposes a non-interactive
     mode with structured streaming output. Document the exact invocation
     and event schema in a comment at the top of `opencode_backend.py`.
   - Implement `spawn()`: subprocess, parse opencode events, yield normalized
     events. Map opencode tool names → canonical.
   - Implement `list_sessions()` if opencode has an on-disk session store;
     otherwise return `[]`.
   - Add `AGENT_BACKEND=opencode` to `.env.example` with a comment.

5. **Wire selection + docs**
   - `get_backend()` reads env var at startup, logs which backend is active.
   - Update `STATUS.md` to mention pluggable backends.
   - Add `docs/guides/agent-backends.md` with: how to switch, what each
     backend supports, known limitations.

6. **Smoke test both backends**
   - With `AGENT_BACKEND=claude`: existing flows unchanged.
   - With `AGENT_BACKEND=opencode`: load a module, run a chat that triggers
     read/edit/bash, verify tool rendering, verify session resume (or
     graceful absence).

## Risks & open questions

- **opencode's non-interactive surface is the critical unknown.** If it has
  no `stream-json`-equivalent mode, the cleanest path is to wait/contribute
  upstream rather than scrape its TUI. Step 4 should start with a 1-hour
  spike to confirm this before committing.
- **Session resume parity.** Claude's `--resume <id>` is clean. opencode may
  not support resume, or may use different identifiers. The contract allows
  `list_sessions` to return `[]`; the UI already degrades.
- **Tool name drift.** Each backend may add tools we don't know about. The
  canonical set should include an `other` bucket so unknown tools render
  generically rather than crashing the humanizer.
- **Thinking events.** Not all backends emit reasoning deltas. The frontend
  must already tolerate their absence (verify during step 2 refactor).
- **Permissions / allow-list.** Claude's `--allowedTools Bash(*) Read(*) ...`
  has no guaranteed equivalent in opencode. If opencode has its own
  permission model, configure it inside `OpencodeBackend.spawn()`; otherwise
  document the gap.

## Out of scope (follow-ups)

- A backend for the Anthropic API directly (no CLI), using the Agent SDK.
- Per-module backend pinning (some modules force a specific agent).
- Multi-agent orchestration (running two backends side-by-side).
