"""Tests for services.social_post."""
from __future__ import annotations

from pathlib import Path

from src.services import social_post


def _msg(role: str, parts: list[dict], thinking: str = "") -> dict:
    return {"id": f"{role}-x", "role": role, "thinking": thinking, "parts": parts}


def _user(text: str) -> dict:
    return _msg("user", [{"type": "text", "text": text}])


def _assistant_text(text: str) -> dict:
    return _msg("assistant", [{"type": "text", "text": text}])


def _tool_call(
    name: str,
    started_ms: int,
    completed_ms: int | None = None,
    output: str = "",
    tool_input: dict | None = None,
) -> dict:
    tc = {
        "id": f"t-{started_ms}",
        "name": name,
        "input": tool_input or {},
        "startedAt": started_ms,
    }
    if completed_ms is not None:
        tc["completedAt"] = completed_ms
        tc["output"] = output
    return {"type": "tool_call", "toolCall": tc}


def test_compute_stats_elapsed_is_first_to_last_tool_call():
    messages = [
        _user("solve the urgent one"),
        _msg("assistant", [
            _tool_call("Read", started_ms=1_000_000),
            _tool_call("Bash", started_ms=1_006_100),
            _tool_call("Edit", started_ms=1_017_900),
        ]),
    ]
    stats = social_post.compute_stats(messages)
    # 1_017_900 - 1_000_000 = 17_900 ms → 17 seconds (floor division)
    assert stats["elapsed_seconds"] == 17


def test_compute_stats_counts_prompts():
    messages = [
        _user("first"),
        _assistant_text("ok"),
        _user("second"),
        _assistant_text("ok"),
    ]
    stats = social_post.compute_stats(messages)
    assert stats["prompt_count"] == 2


def test_compute_stats_no_tool_calls_elapsed_zero():
    messages = [_user("hi"), _assistant_text("hello")]
    stats = social_post.compute_stats(messages)
    assert stats["elapsed_seconds"] == 0
    assert stats["prompt_count"] == 1


def test_compute_stats_single_tool_call_elapsed_zero():
    messages = [
        _user("do it"),
        _msg("assistant", [_tool_call("Read", started_ms=42_000)]),
    ]
    stats = social_post.compute_stats(messages)
    assert stats["elapsed_seconds"] == 0


def test_build_transcript_includes_user_prompt_and_tool_calls():
    messages = [
        _user("solve the urgent one"),
        _msg("assistant", [
            {"type": "text", "text": "checking the linear ticket"},
            _tool_call("Read", 1000, 1200, output="title: Lisa Park paid for Pro"),
            _tool_call("Bash", 2000, 2300, output="billing_tier=free"),
        ]),
        _assistant_text("Done. Lisa is on Pro."),
    ]
    transcript = social_post.build_transcript(messages)

    # Initial user prompt appears verbatim
    assert "solve the urgent one" in transcript
    # Tool-call names appear
    assert "Read" in transcript and "Bash" in transcript
    # Tool outputs are intentionally dropped — the card prompt only needs
    # which services were touched, not their result bodies.
    assert "Lisa Park paid for Pro" not in transcript
    assert "billing_tier=free" not in transcript
    # Final assistant text is included
    assert "Lisa is on Pro" in transcript


def test_build_transcript_drops_tool_outputs():
    long_output = "x" * 5000
    messages = [
        _user("go"),
        _msg("assistant", [_tool_call("Bash", 1000, 2000, output=long_output)]),
    ]
    transcript = social_post.build_transcript(messages)
    # Outputs are dropped entirely — even huge ones never bloat the transcript.
    assert "x" not in transcript
    assert "Bash" in transcript


def test_build_transcript_caps_long_tool_inputs():
    long_input = "y" * 500
    messages = [
        _user("go"),
        _msg(
            "assistant",
            [_tool_call("Bash", 1000, 2000, tool_input={"command": long_input})],
        ),
    ]
    transcript = social_post.build_transcript(messages)
    # Inputs are capped at 80 chars to keep large prompts/queries from bloating
    # the transcript. The cap is on the str(dict) repr, so headroom is small.
    assert "y" * 80 not in transcript or "y" * 81 not in transcript
    # Practically: the transcript should be way shorter than the raw input.
    assert len(transcript) < 300


def test_build_transcript_empty_returns_empty_string():
    assert social_post.build_transcript([]) == ""


import json
from subprocess import CompletedProcess
from unittest.mock import patch


_VALID_PAYLOAD = {
    "title": "Flipped Lisa to Pro",
    "meta_bits": ["1 customer", "2 tables", "fix at source"],
    "services": ["Linear", "Supabase"],
    "problem": {
        "headline": "Lisa paid for Pro.\nStill shows as free.\nTicket open for a week.",
        "meta": "Linear DEMO-5 : support ping",
    },
    "steps": [
        {"text": "Read ticket", "hint": "in Linear", "icon": "📋"},
        {"text": "Pulled record", "hint": "from Supabase", "icon": "🔍"},
        {"text": "Flipped to Pro", "hint": "one field", "icon": "⚡"},
        {"text": "Closed ticket", "hint": "replied too", "icon": "✅"},
    ],
    "outcome": {
        "title": "Lisa on Pro. Ticket closed.",
        "subtitle": "Coffee still warm.",
        "file": "",
        "emoji": "🎉",
        "punchline": "Support chat → Pro tier. 17 seconds.",
    },
}


def _proc(stdout: str, returncode: int = 0) -> CompletedProcess[str]:
    return CompletedProcess(args=["claude"], returncode=returncode, stdout=stdout, stderr="")


def test_extract_content_parses_valid_json():
    with patch("src.services.social_post.run_headless", return_value=_proc(json.dumps(_VALID_PAYLOAD))):
        result = social_post.extract_content("some transcript")
    assert result["services"] == ["Linear", "Supabase"]
    assert result["problem"]["meta"].startswith("Linear DEMO-5")
    assert len(result["steps"]) == 4


def test_extract_content_retries_once_on_bad_json_then_succeeds():
    bad = _proc("here is some prose\n{not json")
    good = _proc(json.dumps(_VALID_PAYLOAD))
    with patch("src.services.social_post.run_headless", side_effect=[bad, good]) as m:
        result = social_post.extract_content("t")
    assert m.call_count == 2
    assert result["services"] == ["Linear", "Supabase"]


def test_extract_content_raises_after_two_failures():
    bad = _proc("totally not json")
    with patch("src.services.social_post.run_headless", return_value=bad):
        import pytest
        with pytest.raises(social_post.ExtractionError):
            social_post.extract_content("t")


def test_extract_content_strips_markdown_fences():
    # Claude sometimes wraps JSON in ```json ... ```
    fenced = "```json\n" + json.dumps(_VALID_PAYLOAD) + "\n```"
    with patch("src.services.social_post.run_headless", return_value=_proc(fenced)):
        result = social_post.extract_content("t")
    assert result["services"] == ["Linear", "Supabase"]


def test_extract_content_injects_transcript_into_prompt():
    captured = {}

    def fake_run(prompt, *, timeout=120, max_turns=1):
        captured["prompt"] = prompt
        return _proc(json.dumps(_VALID_PAYLOAD))

    with patch("src.services.social_post.run_headless", side_effect=fake_run):
        social_post.extract_content("MY UNIQUE TRANSCRIPT MARKER", elapsed_seconds=42)

    assert "MY UNIQUE TRANSCRIPT MARKER" in captured["prompt"]
    assert "{{transcript}}" not in captured["prompt"]
    assert "42" in captured["prompt"]
    assert "{{elapsed_seconds}}" not in captured["prompt"]


class _FakeConn:
    """Stand-in for sqlite3.Connection. load_session_messages uses it only for
    sessions_store.list_messages — we patch that directly."""


def test_generate_social_post_returns_full_payload():
    messages = [
        _user("solve the urgent one"),
        _msg("assistant", [
            _tool_call("Read", 1_000_000, 1_001_000, output="DEMO-5 Lisa Park"),
            _tool_call("Bash", 1_010_000, 1_012_000, output="tier=free"),
            _tool_call("Bash", 1_017_000, 1_018_000, output="ok"),
        ]),
        _assistant_text("Done. Lisa is on Pro."),
    ]

    with patch("src.services.social_post.load_session_messages", return_value=messages), \
         patch("src.services.social_post.run_headless", return_value=_proc(json.dumps(_VALID_PAYLOAD))):
        payload = social_post.generate_social_post(
            session_id="abc",
            conn=_FakeConn(),
            project_dir=Path("/tmp/whatever"),
        )

    assert payload["services"] == ["Linear", "Supabase"]
    assert payload["problem"]["headline"].startswith("Lisa paid for Pro")
    assert payload["stats"]["prompt_count"] == 1
    # (1_017_000 - 1_000_000) / 1000 = 17
    assert payload["stats"]["elapsed_seconds"] == 17
    # Title now comes from the LLM
    assert payload["title"] == "Flipped Lisa to Pro"
    assert payload["meta_bits"] == ["1 customer", "2 tables", "fix at source"]


def test_generate_social_post_raises_no_messages():
    with patch("src.services.social_post.load_session_messages", return_value=[]):
        import pytest
        with pytest.raises(social_post.SessionNotFoundError):
            social_post.generate_social_post("x", _FakeConn(), Path("/tmp/x"))


def test_generate_social_post_raises_no_tool_calls():
    messages = [_user("hi"), _assistant_text("hello")]
    with patch("src.services.social_post.load_session_messages", return_value=messages):
        import pytest
        with pytest.raises(social_post.NoToolCallsError):
            social_post.generate_social_post("x", _FakeConn(), Path("/tmp/x"))


def test_extract_content_raises_on_subprocess_failure():
    bad_proc = CompletedProcess(args=["claude"], returncode=1, stdout="", stderr="rate limited")
    with patch("src.services.social_post.run_headless", return_value=bad_proc):
        import pytest
        with pytest.raises(social_post.ExtractionError, match="claude CLI exited"):
            social_post.extract_content("t")


def test_generate_social_post_raises_when_claude_response_missing_keys():
    messages = [
        _user("go"),
        _msg("assistant", [_tool_call("Read", 1000, 1100), _tool_call("Read", 2000, 2100)]),
    ]
    incomplete_response = {"services": ["Linear"], "problem": {"headline": "x", "meta": "y"}}
    # steps + outcome missing
    with patch("src.services.social_post.load_session_messages", return_value=messages), \
         patch("src.services.social_post.run_headless", return_value=_proc(json.dumps(incomplete_response))):
        import pytest
        with pytest.raises(social_post.ExtractionError, match="missing keys"):
            social_post.generate_social_post("x", _FakeConn(), Path("/tmp/x"))
