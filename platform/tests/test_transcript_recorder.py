# platform/tests/test_transcript_recorder.py
from src.services.transcript_recorder import TranscriptRecorder


def test_empty_recorder_has_no_messages():
    r = TranscriptRecorder()
    assert r.messages == []
    assert r.session_id is None


def test_simple_text_exchange():
    r = TranscriptRecorder()
    r.begin_turn("hi there")
    r.set_session_id("sess-1")
    r.on_text("Hello ")
    r.on_text("world")
    r.finalize()

    assert r.session_id == "sess-1"
    user, asst = r.messages
    assert user["role"] == "user"
    assert user["parts"] == [{"type": "text", "text": "hi there"}]
    assert asst["role"] == "assistant"
    assert asst["parts"] == [{"type": "text", "text": "Hello world"}]
    assert asst["thinking"] == ""


def test_thinking_accumulates_on_assistant():
    r = TranscriptRecorder()
    r.begin_turn("go")
    r.set_session_id("s")
    r.on_thinking("let me ")
    r.on_thinking("think")
    r.on_text("done")
    r.finalize()
    _, asst = r.messages
    assert asst["thinking"] == "let me think"


def test_tool_use_and_result_pair():
    r = TranscriptRecorder()
    r.begin_turn("run ls")
    r.set_session_id("s")
    r.on_tool_use("tool_a", "Bash", {"command": "ls"})
    r.on_tool_result("tool_a", "file1\nfile2")
    r.finalize()
    _, asst = r.messages
    assert len(asst["parts"]) == 1
    tc = asst["parts"][0]
    assert tc["type"] == "tool_call"
    assert tc["toolCall"]["id"] == "tool_a"
    assert tc["toolCall"]["name"] == "Bash"
    assert tc["toolCall"]["input"] == {"command": "ls"}
    assert tc["toolCall"]["output"] == "file1\nfile2"


def test_tool_result_with_unknown_id_is_ignored():
    r = TranscriptRecorder()
    r.begin_turn("x")
    r.set_session_id("s")
    r.on_tool_result("ghost", "data")
    r.finalize()
    _, asst = r.messages
    assert asst["parts"] == []


def test_text_between_tool_calls_stays_separate():
    """Mirrors frontend: new text block after a tool_call must not merge into
    a pre-tool text part."""
    r = TranscriptRecorder()
    r.begin_turn("x")
    r.set_session_id("s")
    r.on_text("Before ")
    r.on_tool_use("t1", "Read", {})
    r.on_tool_result("t1", "ok")
    r.on_text("After")
    r.finalize()
    _, asst = r.messages
    assert [p["type"] for p in asst["parts"]] == ["text", "tool_call", "text"]
    assert asst["parts"][0]["text"] == "Before "
    assert asst["parts"][2]["text"] == "After"


def test_finalize_without_session_id_produces_empty():
    """If the stream errored before the `system` event arrived, we have no
    session to persist against. Don't crash; just produce nothing."""
    r = TranscriptRecorder()
    r.begin_turn("x")
    r.on_text("partial")
    r.finalize()
    assert r.session_id is None
    assert r.messages == []
