"""Unit tests for src.services.chat.claude.

Mocks subprocess — never spawns a real `claude` binary. Asserts argv + env
construction, which is the whole surface area of this service.
"""
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# build_env
# ---------------------------------------------------------------------------


def test_build_env_includes_telemetry_off():
    from src.services.chat.claude import build_env, _TELEMETRY_OFF_ENV

    env = build_env()
    for key, value in _TELEMETRY_OFF_ENV.items():
        assert env[key] == value


def test_build_env_inherits_os_environ(monkeypatch):
    monkeypatch.setenv("SOME_UNRELATED_VAR", "hello")
    from src.services.chat.claude import build_env

    env = build_env()
    assert env["SOME_UNRELATED_VAR"] == "hello"


def test_build_env_maps_llm_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    from src.services.chat import claude as claude_service

    with patch.object(claude_service.settings, "LLM_API_KEY", "sk-test-123"):
        env = claude_service.build_env()

    assert env["ANTHROPIC_AUTH_TOKEN"] == "sk-test-123"


def test_build_env_maps_llm_base_url(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_BASE_URL", raising=False)
    from src.services.chat import claude as claude_service

    with patch.object(claude_service.settings, "LLM_BASE_URL", "https://proxy.example.com"):
        env = claude_service.build_env()

    assert env["ANTHROPIC_BASE_URL"] == "https://proxy.example.com"


def test_build_env_maps_llm_model_to_all_three_anthropic_model_vars(monkeypatch):
    for k in ("ANTHROPIC_DEFAULT_OPUS_MODEL",
              "ANTHROPIC_DEFAULT_SONNET_MODEL",
              "ANTHROPIC_DEFAULT_HAIKU_MODEL"):
        monkeypatch.delenv(k, raising=False)
    from src.services.chat import claude as claude_service

    with patch.object(claude_service.settings, "LLM_MODEL", "my-custom-model"):
        env = claude_service.build_env()

    assert env["ANTHROPIC_DEFAULT_OPUS_MODEL"] == "my-custom-model"
    assert env["ANTHROPIC_DEFAULT_SONNET_MODEL"] == "my-custom-model"
    assert env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] == "my-custom-model"


def test_build_env_preexisting_anthropic_auth_token_wins(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "user-supplied")
    from src.services.chat import claude as claude_service

    with patch.object(claude_service.settings, "LLM_API_KEY", "settings-supplied"):
        env = claude_service.build_env()

    assert env["ANTHROPIC_AUTH_TOKEN"] == "user-supplied"


# ---------------------------------------------------------------------------
# run_headless
# ---------------------------------------------------------------------------


def test_run_headless_argv_shape():
    from src.services.chat import claude as claude_service

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = "summary text"
    mock_proc.stderr = ""

    with patch("src.services.chat.claude.subprocess.run", return_value=mock_proc) as mock_run:
        result = claude_service.run_headless("my prompt")

    assert result is mock_proc
    argv = mock_run.call_args.args[0]
    assert argv[0:3] == ["claude", "-p", "my prompt"]
    assert "--output-format" in argv
    assert argv[argv.index("--output-format") + 1] == "text"
    assert "--max-turns" in argv
    assert argv[argv.index("--max-turns") + 1] == "1"


def test_run_headless_uses_build_env():
    from src.services.chat import claude as claude_service

    sentinel_env = {"SENTINEL": "1"}
    mock_proc = MagicMock(returncode=0, stdout="", stderr="")

    with patch("src.services.chat.claude.build_env", return_value=sentinel_env), \
         patch("src.services.chat.claude.subprocess.run", return_value=mock_proc) as mock_run:
        claude_service.run_headless("x")

    assert mock_run.call_args.kwargs["env"] == sentinel_env
    assert mock_run.call_args.kwargs["capture_output"] is True
    assert mock_run.call_args.kwargs["text"] is True


def test_run_headless_respects_timeout_kwarg():
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.run",
               return_value=MagicMock(returncode=0, stdout="", stderr="")) as mock_run:
        claude_service.run_headless("x", timeout=7)

    assert mock_run.call_args.kwargs["timeout"] == 7


def test_run_headless_respects_max_turns_kwarg():
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.run",
               return_value=MagicMock(returncode=0, stdout="", stderr="")) as mock_run:
        claude_service.run_headless("x", max_turns=3)

    argv = mock_run.call_args.args[0]
    assert argv[argv.index("--max-turns") + 1] == "3"


# ---------------------------------------------------------------------------
# stream
# ---------------------------------------------------------------------------


def test_stream_minimal_argv():
    from src.services.chat import claude as claude_service

    fake_popen = MagicMock()
    with patch("src.services.chat.claude.subprocess.Popen", return_value=fake_popen) as mock_popen:
        result = claude_service.stream("hello")

    assert result is fake_popen
    argv = mock_popen.call_args.args[0]
    assert argv[0:3] == ["claude", "-p", "hello"]
    assert "--verbose" in argv
    assert "--output-format" in argv
    assert argv[argv.index("--output-format") + 1] == "stream-json"
    assert "--include-partial-messages" in argv
    # No optional flags supplied:
    assert "--resume" not in argv
    assert "--append-system-prompt" not in argv
    assert "--allowedTools" not in argv


def test_stream_with_session_id():
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.Popen") as mock_popen:
        claude_service.stream("hi", session_id="abc-123")

    argv = mock_popen.call_args.args[0]
    assert "--resume" in argv
    assert argv[argv.index("--resume") + 1] == "abc-123"


def test_stream_with_append_system_prompt():
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.Popen") as mock_popen:
        claude_service.stream("hi", append_system_prompt="# CLAUDE.md\n...")

    argv = mock_popen.call_args.args[0]
    assert "--append-system-prompt" in argv
    assert argv[argv.index("--append-system-prompt") + 1] == "# CLAUDE.md\n..."


def test_stream_with_allowed_tools_expands_each_as_positional():
    """--allowedTools must be followed by multiple positional tool specs, not a joined string."""
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.Popen") as mock_popen:
        claude_service.stream("hi", allowed_tools=["Bash(*)", "Read(*)", "Write(*)"])

    argv = mock_popen.call_args.args[0]
    idx = argv.index("--allowedTools")
    assert argv[idx + 1] == "Bash(*)"
    assert argv[idx + 2] == "Read(*)"
    assert argv[idx + 3] == "Write(*)"


def test_stream_uses_build_env_and_popen_kwargs():
    from src.services.chat import claude as claude_service

    sentinel_env = {"SENTINEL": "1"}
    with patch("src.services.chat.claude.build_env", return_value=sentinel_env), \
         patch("src.services.chat.claude.subprocess.Popen") as mock_popen:
        claude_service.stream("hi", cwd=Path("/tmp/work"))

    kwargs = mock_popen.call_args.kwargs
    assert kwargs["env"] == sentinel_env
    assert kwargs["cwd"] == "/tmp/work"
    assert kwargs["stdout"] == subprocess.PIPE
    assert kwargs["stderr"] == subprocess.PIPE
    assert kwargs["text"] is True


def test_stream_cwd_none_passes_none_not_empty_string():
    from src.services.chat import claude as claude_service

    with patch("src.services.chat.claude.subprocess.Popen") as mock_popen:
        claude_service.stream("hi")

    assert mock_popen.call_args.kwargs["cwd"] is None
