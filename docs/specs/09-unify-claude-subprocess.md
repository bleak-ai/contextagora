# Spec 09 — Unify the two Claude-subprocess shapes

## Goal

Collapse the two independent `subprocess.run("claude", ...)` call sites (`routes/chat.py` streaming + `routes/modules.py` headless) into a single `services/claude.py` with `run_headless()` and `stream()`. Shared env setup (LLM backend mapping, telemetry disable) lives in one place.

## Answers driving this spec

- Spec 02 Q2 answer: **Unify it**. Remaining spec-9 questions blank; defaults applied:
  - **Single `services/claude.py`** with `run_headless()` + `stream()`.
  - **Shared env helper** applied to both paths. The fact that the headless path doesn't currently apply `LLM_API_KEY → ANTHROPIC_AUTH_TOKEN` mapping is a **latent bug** — summaries/detect-packages would fail on non-Anthropic backends. Fix as part of this spec.
  - **Telemetry-disable env** applied to both paths (no reason the chat subprocess should telemeter when the headless path doesn't).

## Current state

### Chat (`routes/chat.py:47-210`)

- Builds env by mapping `settings.LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` into `ANTHROPIC_*` vars.
- Spawns `claude -p <prompt> --verbose --output-format stream-json --include-partial-messages --allowedTools …` with optional `--resume <session_id>` and `--append-system-prompt <CLAUDE.md>`.
- Uses `subprocess.Popen` + line-reader for streaming.
- No telemetry-disable env.

### Headless (`routes/modules.py:300-407`)

- `_CLAUDE_HEADLESS_ENV` disables telemetry + auto-updater.
- `_run_claude_headless(prompt)` uses `subprocess.run` with `--output-format text --max-turns 1`.
- Used by `POST /api/modules/{name}/generate` and `POST /api/modules/{name}/detect-packages`.
- No LLM-backend mapping.

## Target shape

```
src/services/claude.py
```

### API

```python
from subprocess import CompletedProcess, Popen
from typing import Iterator

def run_headless(
    prompt: str,
    *,
    timeout: int = 120,
    max_turns: int = 1,
) -> CompletedProcess[str]:
    """Blocking single-shot call. Returns CompletedProcess for caller to inspect."""

def stream(
    prompt: str,
    *,
    session_id: str | None = None,
    append_system_prompt: str | None = None,
    cwd: Path | None = None,
    allowed_tools: list[str] | None = None,
) -> Popen[str]:
    """Starts a streaming subprocess; caller reads proc.stdout line-by-line
    and handles the SSE translation. Returning the Popen keeps the route's
    existing generator shape — we only unify env + argv construction, not the
    stream parsing."""
```

### Private helpers

```python
_TELEMETRY_OFF_ENV = {
    "DISABLE_AUTOUPDATER": "1",
    "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
}

def _build_env() -> dict[str, str]:
    """Inherit os.environ, add telemetry-off, add LLM_* → ANTHROPIC_* mapping.
    One source of truth for every claude subprocess."""
```

The LLM mapping (currently in `chat.py:62-69`) moves here verbatim.

## Implementation steps

### 1. Create `services/claude.py`

- Move `_CLAUDE_HEADLESS_ENV` from `routes/modules.py` into this file as `_TELEMETRY_OFF_ENV`.
- Implement `_build_env()` consolidating both env setups.
- Implement `run_headless()` — body = current `_run_claude_headless` using `_build_env()`.
- Implement `stream()` — returns `Popen`, configured with streaming flags. Callers still consume `proc.stdout` themselves (simplest path to unify without ripping up the SSE parser).

### 2. Migrate `routes/modules.py`

- Delete `_CLAUDE_HEADLESS_ENV` and `_run_claude_headless`.
- Replace calls with `from src.services.claude import run_headless` / `run_headless(prompt)`.

### 3. Migrate `routes/chat.py`

- Delete the inline env build (lines 59-70).
- Replace `subprocess.Popen(cmd, ...)` with:
  ```python
  proc = claude.stream(
      prompt=_expand_slash_command(body.prompt),
      session_id=body.claude_session_id,
      append_system_prompt=claude_md_content if new_conversation else None,
      cwd=settings.CONTEXT_DIR,
      allowed_tools=["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "Glob(*)", "Grep(*)"],
  )
  ```
- All SSE parsing stays in `routes/chat.py`.

### 4. Bug fix opportunity

Now that `_build_env()` applies LLM mapping to `run_headless()` too, summary generation and package detection work against non-Anthropic backends. Verify by reading the headless-route tests (if any) and updating them if they asserted stripped-down env.

## Dependency with other specs

- **Spec 02** (break up `routes/modules.py`) consumes this spec's `run_headless`.
- **Spec 08** (remove `.claude`) is independent.

Order: do **Spec 09 before Spec 02** so the module routes refactor can call into the finished `services/claude.py`.

## Acceptance

- `grep -rn "subprocess.run.*claude\|subprocess.Popen.*claude" platform/src` returns only `services/claude.py`.
- Both routes import from `src.services.claude`.
- Telemetry env applies to both paths (verify by `grep "CLAUDE_CODE_ENABLE_TELEMETRY"`).
- LLM backend mapping applies to both paths.
- Manual check: chat still streams normally; `POST /api/modules/linear/generate` still returns a summary; both work with an `LLM_BASE_URL` set to a proxy if such a config is available.

## Out of scope

- Rewriting the SSE event loop in `routes/chat.py` (covered in spec 07 7a — deferred).
- Replacing subprocess with the Anthropic SDK.
