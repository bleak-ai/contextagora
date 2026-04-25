"""Tests for services.tweet."""
from __future__ import annotations

from pathlib import Path
from subprocess import CompletedProcess
from unittest.mock import patch

import pytest

from src.services import tweet


def _msg(role: str, parts: list[dict], thinking: str = "") -> dict:
    return {"id": f"{role}-x", "role": role, "thinking": thinking, "parts": parts}


def _user(text: str) -> dict:
    return _msg("user", [{"type": "text", "text": text}])


def _assistant_text(text: str) -> dict:
    return _msg("assistant", [{"type": "text", "text": text}])


def _tool_call(name: str, started_ms: int, completed_ms: int | None = None, output: str = "") -> dict:
    tc = {"id": f"t-{started_ms}", "name": name, "input": {}, "startedAt": started_ms}
    if completed_ms is not None:
        tc["completedAt"] = completed_ms
        tc["output"] = output
    return {"type": "tool_call", "toolCall": tc}


def _proc(stdout: str, returncode: int = 0) -> CompletedProcess[str]:
    return CompletedProcess(args=["claude"], returncode=returncode, stdout=stdout, stderr="")


_VALID_TWEET = (
    '"How many members got charged twice this month?"\n'
    "Used to take 30 min: open Stripe, export, cross-ref by hand.\n"
    "Now: one prompt. Both tools queried. Answer in 20 sec.\n"
    "Join the waitlist -> contextagora.com"
)


class _FakeConn:
    """Stand-in for sqlite3.Connection. load_session_messages uses it only for
    sessions_store.list_messages — we patch that directly."""


def test_extract_tweet_returns_stripped_text():
    with patch("src.services.tweet.run_headless", return_value=_proc(_VALID_TWEET + "\n")):
        result = tweet.extract_tweet("some transcript")
    assert result == _VALID_TWEET  # trailing whitespace stripped


def test_extract_tweet_strips_markdown_fences():
    fenced = "```\n" + _VALID_TWEET + "\n```"
    with patch("src.services.tweet.run_headless", return_value=_proc(fenced)):
        result = tweet.extract_tweet("t")
    assert result == _VALID_TWEET


def test_extract_tweet_injects_transcript_and_elapsed_into_prompt():
    captured = {}

    def fake_run(prompt, *, timeout=120, max_turns=1):
        captured["prompt"] = prompt
        return _proc(_VALID_TWEET)

    with patch("src.services.tweet.run_headless", side_effect=fake_run):
        tweet.extract_tweet("MY UNIQUE TRANSCRIPT MARKER", elapsed_seconds=42)

    assert "MY UNIQUE TRANSCRIPT MARKER" in captured["prompt"]
    assert "{{transcript}}" not in captured["prompt"]
    assert "42" in captured["prompt"]
    assert "{{elapsed_seconds}}" not in captured["prompt"]


def test_extract_tweet_retries_once_on_subprocess_failure_then_succeeds():
    bad = CompletedProcess(args=["claude"], returncode=1, stdout="", stderr="rate limited")
    good = _proc(_VALID_TWEET)
    with patch("src.services.tweet.run_headless", side_effect=[bad, good]) as m:
        result = tweet.extract_tweet("t")
    assert m.call_count == 2
    assert result == _VALID_TWEET


def test_extract_tweet_raises_after_two_subprocess_failures():
    bad = CompletedProcess(args=["claude"], returncode=1, stdout="", stderr="boom")
    with patch("src.services.tweet.run_headless", return_value=bad):
        with pytest.raises(tweet.ExtractionError, match="claude CLI exited"):
            tweet.extract_tweet("t")


def test_extract_tweet_raises_on_empty_output():
    with patch("src.services.tweet.run_headless", return_value=_proc("   \n  ")):
        with pytest.raises(tweet.ExtractionError, match="empty"):
            tweet.extract_tweet("t")


def test_generate_tweet_returns_text_and_session_block():
    messages = [
        _user("solve the urgent one"),
        _msg("assistant", [
            _tool_call("Read", 1_000_000, 1_001_000, output="DEMO-5 Lisa Park"),
            _tool_call("Bash", 1_017_000, 1_018_000, output="ok"),
        ]),
        _assistant_text("Done."),
    ]
    with patch("src.services.tweet.load_session_messages", return_value=messages), \
         patch("src.services.tweet.run_headless", return_value=_proc(_VALID_TWEET)):
        payload = tweet.generate_tweet(
            session_id="abc",
            conn=_FakeConn(),
            project_dir=Path("/tmp/whatever"),
        )

    assert payload["text"] == _VALID_TWEET
    assert payload["session"]["id"] == "abc"
    assert "date_iso" in payload["session"]


def test_generate_tweet_raises_session_not_found_when_no_messages():
    with patch("src.services.tweet.load_session_messages", return_value=[]):
        with pytest.raises(tweet.SessionNotFoundError):
            tweet.generate_tweet("x", _FakeConn(), Path("/tmp/x"))


def test_generate_tweet_raises_no_tool_calls():
    messages = [_user("hi"), _assistant_text("hello")]
    with patch("src.services.tweet.load_session_messages", return_value=messages):
        with pytest.raises(tweet.NoToolCallsError):
            tweet.generate_tweet("x", _FakeConn(), Path("/tmp/x"))


def test_generate_tweet_passes_elapsed_seconds_from_stats_into_prompt():
    """Verifies the service threads compute_stats output into the LLM prompt."""
    messages = [
        _user("go"),
        _msg("assistant", [
            _tool_call("Read", 1_000_000),
            _tool_call("Bash", 1_017_000, 1_018_000, output="ok"),
        ]),
    ]
    captured = {}

    def fake_run(prompt, *, timeout=120, max_turns=1):
        captured["prompt"] = prompt
        return _proc(_VALID_TWEET)

    with patch("src.services.tweet.load_session_messages", return_value=messages), \
         patch("src.services.tweet.run_headless", side_effect=fake_run):
        tweet.generate_tweet("x", _FakeConn(), Path("/tmp/x"))

    # 1_017_000 - 1_000_000 = 17_000 ms -> 17 seconds
    assert "17" in captured["prompt"]
