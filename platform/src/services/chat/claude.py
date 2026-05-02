"""Single source of truth for spawning the `claude` CLI.

Both the streaming chat route and the headless module-summary route call
into this module. Env construction (telemetry-off + LLM backend mapping)
is unified in `build_env()`; every claude subprocess sees the same env.
"""
from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path
from subprocess import CompletedProcess, Popen

from src.config import settings

log = logging.getLogger(__name__)


_TELEMETRY_OFF_ENV: dict[str, str] = {
    "DISABLE_AUTOUPDATER": "1",
    "CLAUDE_CODE_ENABLE_TELEMETRY": "0",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
}


def build_env() -> dict[str, str]:
    env: dict[str, str] = {**os.environ, **_TELEMETRY_OFF_ENV}
    if settings.LLM_API_KEY:
        env.setdefault("ANTHROPIC_AUTH_TOKEN", settings.LLM_API_KEY)
    if settings.LLM_BASE_URL:
        env.setdefault("ANTHROPIC_BASE_URL", settings.LLM_BASE_URL)
    if settings.LLM_MODEL:
        env.setdefault("ANTHROPIC_DEFAULT_OPUS_MODEL", settings.LLM_MODEL)
        env.setdefault("ANTHROPIC_DEFAULT_SONNET_MODEL", settings.LLM_MODEL)
        env.setdefault("ANTHROPIC_DEFAULT_HAIKU_MODEL", settings.LLM_MODEL)
    return env


def run_headless(
    prompt: str,
    *,
    timeout: int = 120,
    max_turns: int = 1,
) -> CompletedProcess[str]:
    """Blocking single-shot `claude -p` call. Returns CompletedProcess.

    Callers inspect proc.returncode / stdout / stderr themselves.
    """
    log.info(
        "claude run_headless prompt (%d chars):\n%s\n--- end prompt ---",
        len(prompt),
        prompt,
    )
    return subprocess.run(
        [
            "claude", "-p", prompt,
            "--output-format", "text",
            "--max-turns", str(max_turns),
            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
            "--permission-mode", "bypassPermissions",
            "--no-session-persistence",
        ],
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        cwd="/tmp",
        env=build_env(),
        timeout=timeout,
    )


def stream(
    prompt: str,
    *,
    session_id: str | None = None,
    append_system_prompt: str | None = None,
    cwd: Path | None = None,
    allowed_tools: list[str] | None = None,
) -> Popen[str]:
    """Start a streaming `claude -p` subprocess. Caller reads proc.stdout.

    Returns Popen directly — the chat route's SSE parser stays in place;
    this only unifies env + argv construction. Not for one-shot calls —
    use `run_headless()` for that.
    """
    cmd: list[str] = [
        "claude", "-p", prompt,
        "--verbose",
        "--output-format", "stream-json",
        "--include-partial-messages",
    ]
    if allowed_tools:
        cmd.extend(["--allowedTools", *allowed_tools])
    if session_id:
        cmd.extend(["--resume", session_id])
    if append_system_prompt:
        cmd.extend(["--append-system-prompt", append_system_prompt])

    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        cwd=str(cwd) if cwd else None,
        env=build_env(),
        text=True,
    )
