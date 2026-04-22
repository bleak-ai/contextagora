"""Tests for src.services.claude_sessions.read_transcript."""
import json
import sqlite3
from pathlib import Path

from src.services import sessions_store
from src.services.claude_sessions import load_session_messages, read_transcript


def _write_jsonl(tmp_path: Path, events: list[dict]) -> Path:
    p = tmp_path / "session.jsonl"
    with p.open("w", encoding="utf-8") as f:
        for ev in events:
            f.write(json.dumps(ev) + "\n")
    return p


def test_missing_file_returns_empty(tmp_path: Path):
    assert read_transcript(tmp_path / "nope.jsonl") == []


def test_skips_queue_operations_attachments_sidechain(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "queue-operation", "operation": "enqueue"},
        {"type": "user", "isSidechain": True, "uuid": "s1",
         "message": {"role": "user", "content": "sidechain"}},
        {"isSidechain": False, "attachment": {"type": "skill_listing", "content": "x"}},
    ])
    assert read_transcript(p) == []


def test_user_text_becomes_message(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "hello"}},
    ])
    msgs = read_transcript(p)
    assert len(msgs) == 2  # user + empty assistant opened
    assert msgs[0] == {
        "id": "user-u1",
        "role": "user",
        "thinking": "",
        "parts": [{"type": "text", "text": "hello"}],
    }
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["parts"] == []
    assert msgs[1]["thinking"] == ""


def test_empty_user_text_skipped(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "   "}},
    ])
    assert read_transcript(p) == []


def test_assistant_thinking_and_text_merge(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "hi"}},
        {"type": "assistant", "uuid": "a1", "timestamp": "2026-04-21T07:49:17.131Z",
         "message": {"id": "m1", "content": [
             {"type": "thinking", "thinking": "hmm "}
         ]}},
        {"type": "assistant", "uuid": "a2", "timestamp": "2026-04-21T07:49:18.131Z",
         "message": {"id": "m1", "content": [
             {"type": "thinking", "thinking": "ok."}
         ]}},
        {"type": "assistant", "uuid": "a3", "timestamp": "2026-04-21T07:49:19.131Z",
         "message": {"id": "m2", "content": [
             {"type": "text", "text": "Hello "}
         ]}},
        {"type": "assistant", "uuid": "a4", "timestamp": "2026-04-21T07:49:20.131Z",
         "message": {"id": "m2", "content": [
             {"type": "text", "text": "world"}
         ]}},
    ])
    msgs = read_transcript(p)
    asst = msgs[1]
    assert asst["thinking"] == "hmm ok."
    assert asst["parts"] == [{"type": "text", "text": "Hello world"}]


def test_tool_use_and_tool_result_pair(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "ls"}},
        {"type": "assistant", "uuid": "a1", "timestamp": "2026-04-21T07:49:17.000Z",
         "message": {"id": "m1", "content": [
             {"type": "tool_use", "id": "tool_a", "name": "Bash",
              "input": {"command": "ls"}}
         ]}},
        {"type": "user", "uuid": "u2", "timestamp": "2026-04-21T07:49:18.000Z",
         "message": {"role": "user", "content": [
             {"type": "tool_result", "tool_use_id": "tool_a", "content": "file1\nfile2"}
         ]}},
    ])
    msgs = read_transcript(p)
    asst = msgs[1]
    assert asst["parts"][0]["type"] == "tool_call"
    tc = asst["parts"][0]["toolCall"]
    assert tc["id"] == "tool_a"
    assert tc["name"] == "Bash"
    assert tc["input"] == {"command": "ls"}
    assert tc["output"] == "file1\nfile2"
    assert tc["startedAt"] > 0
    assert tc["completedAt"] > tc["startedAt"]


def test_tool_result_content_as_block_list(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "go"}},
        {"type": "assistant", "uuid": "a1",
         "message": {"id": "m1", "content": [
             {"type": "tool_use", "id": "t1", "name": "Read", "input": {}}
         ]}},
        {"type": "user", "uuid": "u2",
         "message": {"role": "user", "content": [
             {"type": "tool_result", "tool_use_id": "t1",
              "content": [{"type": "text", "text": "line"}]}
         ]}},
    ])
    msgs = read_transcript(p)
    tc = msgs[1]["parts"][0]["toolCall"]
    assert tc["output"] == "line"


def test_second_user_turn_starts_new_assistant(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "first"}},
        {"type": "assistant", "uuid": "a1",
         "message": {"id": "m1", "content": [{"type": "text", "text": "one"}]}},
        {"type": "user", "uuid": "u2",
         "message": {"role": "user", "content": "second"}},
        {"type": "assistant", "uuid": "a2",
         "message": {"id": "m2", "content": [{"type": "text", "text": "two"}]}},
    ])
    msgs = read_transcript(p)
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert msgs[1]["parts"][0]["text"] == "one"
    assert msgs[3]["parts"][0]["text"] == "two"


def test_tool_result_with_no_matching_tool_call_is_ignored(tmp_path: Path):
    p = _write_jsonl(tmp_path, [
        {"type": "user", "uuid": "u1",
         "message": {"role": "user", "content": "hi"}},
        {"type": "user", "uuid": "u2",
         "message": {"role": "user", "content": [
             {"type": "tool_result", "tool_use_id": "ghost", "content": "x"}
         ]}},
    ])
    msgs = read_transcript(p)
    assert msgs[1]["parts"] == []


def test_load_session_messages_prefers_db(tmp_path):
    db = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(db)
    sessions_store.save_message(
        db, "sess-x", seq=0,
        message={"id": "m1", "role": "user", "thinking": "",
                 "parts": [{"type": "text", "text": "from db"}]},
        created_at_ms=1,
    )
    proj_dir = tmp_path / "proj"
    proj_dir.mkdir()
    jsonl = proj_dir / "sess-x.jsonl"
    jsonl.write_text(
        '{"type":"user","uuid":"u","message":{"role":"user","content":"from jsonl"}}\n'
    )

    msgs = load_session_messages("sess-x", db, proj_dir)
    assert len(msgs) == 1
    assert msgs[0]["parts"][0]["text"] == "from db"


def test_load_session_messages_falls_back_to_jsonl(tmp_path):
    db = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(db)
    proj_dir = tmp_path / "proj"
    proj_dir.mkdir()
    jsonl = proj_dir / "sess-y.jsonl"
    jsonl.write_text(
        '{"type":"user","uuid":"u","message":{"role":"user","content":"only jsonl"}}\n'
    )

    msgs = load_session_messages("sess-y", db, proj_dir)
    # Existing read_transcript emits user + empty assistant for a plain user msg.
    assert msgs[0]["role"] == "user"
    assert msgs[0]["parts"][0]["text"] == "only jsonl"


def test_load_session_messages_returns_empty_when_neither_source_has_it(tmp_path):
    db = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(db)
    proj_dir = tmp_path / "proj"
    proj_dir.mkdir()
    assert load_session_messages("ghost", db, proj_dir) == []


def test_load_session_messages_db_only_does_not_require_jsonl(tmp_path):
    """Regression guard: a DB hit must short-circuit before any filesystem
    check, so DB-only sessions work even if the project dir doesn't exist."""
    db = sqlite3.connect(":memory:")
    sessions_store.ensure_schema(db)
    sessions_store.save_message(
        db, "sess-z", seq=0,
        message={"id": "m", "role": "user", "thinking": "",
                 "parts": [{"type": "text", "text": "only db"}]},
        created_at_ms=1,
    )
    proj_dir = tmp_path / "nonexistent-proj"  # never created
    msgs = load_session_messages("sess-z", db, proj_dir)
    assert msgs[0]["parts"][0]["text"] == "only db"
