# Debugging Claude Code Latency

> A reproducible methodology for measuring where time goes during a Claude
> Code chat session in this project. Use when something feels slow and you
> want evidence instead of guesses.

**For the agent reading this:** when the user says something like "let's check
the times with the new model" or "start recording, I'll run a query," follow
the procedure in this file exactly. Do not invent variations. The watcher
script and the analysis format are deliberately stable so traces are
comparable across runs.

---

## What this measures

Every event Claude Code writes to its on-disk session transcript
(`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`) carries a `timestamp`.
By tailing the relevant directory and computing the delta between consecutive
events, you can see exactly how long each phase took:

- **Big delta before an `assistant` event** → model thinking time (no I/O).
- **Big delta before a `user` / `tool_result` event** → the *tool itself*
  was slow (Bash command, Read, network call, etc.).
- **Small delta everywhere** → nothing is slow; stop optimizing.

The transcript is the most complete record that exists. It is not sampled,
not approximated, not subject to the SSE filter in `chat.py`. If an event
happened, it is in the JSONL.

---

## The watcher script

A standalone Python script lives at `/tmp/claude-timing-watch.py`. It watches
the session directory for `.jsonl` files modified after the watcher started,
parses every new line, and prints one row per event with the delta from the
previous event, the event type, a snippet describing the tool call, and (for
assistant turns) the input/output token counts.

**Recreate it if missing:**

```python
#!/usr/bin/env python3
"""Watch the Claude session dir, print timing for every new JSONL line."""
import json
import time
from datetime import datetime
from pathlib import Path

DIR = Path("/Users/bsampera/.claude/projects/-Users-bsampera-Documents-bleak-dev-context-loader-platform-src-context")
START = time.time()

offsets: dict[Path, int] = {}
prev_ts: datetime | None = None

print(f"watching {DIR}", flush=True)
print(f"started at {datetime.now().isoformat()}", flush=True)
print("delta   event      detail", flush=True)
print("-" * 60, flush=True)

while True:
    try:
        files = sorted(DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
    except FileNotFoundError:
        time.sleep(0.2)
        continue

    for f in files:
        if f.stat().st_mtime < START - 1:
            continue
        if f not in offsets:
            offsets[f] = f.stat().st_size
            print(f"# tracking {f.name} from offset {offsets[f]}", flush=True)
        try:
            with open(f, "rb") as fh:
                fh.seek(offsets[f])
                chunk = fh.read()
                offsets[f] = fh.tell()
        except FileNotFoundError:
            continue
        if not chunk:
            continue

        for raw in chunk.splitlines():
            if not raw.strip():
                continue
            try:
                ev = json.loads(raw)
            except json.JSONDecodeError:
                continue

            ts_str = ev.get("timestamp")
            if not ts_str:
                continue
            try:
                t = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                continue

            delta = (t - prev_ts).total_seconds() if prev_ts else 0.0
            prev_ts = t

            ev_type = ev.get("type", "")
            detail = ""
            msg = ev.get("message") or {}
            content = msg.get("content")
            if isinstance(content, list) and content:
                first = content[0]
                if isinstance(first, dict):
                    detail = first.get("name") or first.get("type") or ""
                    if first.get("type") == "tool_use":
                        tool_name = first.get("name", "")
                        tin = first.get("input", {})
                        if isinstance(tin, dict):
                            cmd = tin.get("command") or tin.get("file_path") or tin.get("pattern") or ""
                            if cmd:
                                detail = f"{tool_name}: {str(cmd)[:60]}"
                            else:
                                detail = tool_name
                    elif first.get("type") == "tool_result":
                        detail = "tool_result"

            usage = msg.get("usage") or {}
            in_tok = usage.get("input_tokens")
            out_tok = usage.get("output_tokens")
            tok_str = ""
            if in_tok or out_tok:
                tok_str = f"  [in={in_tok} out={out_tok}]"

            print(f"{delta:6.2f}s  {ev_type:10}  {detail}{tok_str}", flush=True)

    time.sleep(0.2)
```

If your `cwd` is different, update `DIR` to match
`~/.claude/projects/<your-encoded-cwd>`. The encoding rule: take the absolute
path of the directory the chat runs in (in this project, `CONTEXT_DIR` =
`platform/src/context`), and replace every `/` with `-`, prefixed with `-`.

---

## Procedure (the agent runs this end-to-end)

When the user says "start recording," do exactly the following. No
deviations, no extra steps, no preamble.

### 1. Start the watcher in the background

Truncate the log first so previous runs do not contaminate the analysis:

    : > /tmp/claude-timing.log && uv run python /tmp/claude-timing-watch.py >> /tmp/claude-timing.log 2>&1

Run this with the Bash tool's `run_in_background: true` option. Save the
returned bash ID — you will need it to kill the watcher at the end.

### 2. Tell the user to go

One short line: *"Watcher running. Send your request in the chat UI now.
Tell me when it's done."* No padding.

### 3. While the user is running their request

Optionally peek at the log once or twice to confirm events are flowing:

    wc -l /tmp/claude-timing.log && tail -5 /tmp/claude-timing.log

Do not analyze yet. Wait for the user to say "done."

### 4. After "done": read the full log and stop the watcher

    cat /tmp/claude-timing.log

Then stop the watcher (it is harmless to leave running, but stop it for
cleanliness):

    pkill -f claude-timing-watch.py 2>/dev/null; echo done

You will receive a `task-notification` with exit code 144 (= 128 + SIGTERM).
This is expected. Acknowledge briefly and move on.

### 5. Build the analysis table

Format the output as a markdown table with three columns: **Δ** (the delta
from the previous event), **Event** (the event type, with the tool name and
a snippet of the input where applicable), **What it means** (a short
human-readable interpretation).

Example shape (taken from a real run on 2026-04-07):

| Δ | Event | What it means |
|---:|---|---|
| 0.46s | Read | model picked first file, server returned it (fast) |
| 1.60s | Read | model + Read |
| 1.37s | Read | model + Read |
| 3.73s | thinking | model decided what to do next, no I/O |
| 1.75s | Bash: varlock run … PYEOF | model wrote the command |
| 3.25s | tool_result | first varlock+Infisical+Firestore call returned |
| 5.50s | Bash: varlock run … PYEOF | model wrote a second, different script |
| **120.02s** | **tool_result** | ⚠️ **two-minute hang** |
| 4.08s | Bash: sleep 8 && cat /private/tmp/claude-501/... | recovery attempt |
| 6.19s | tool_result | recovery returned |
| 5.47s | text | final answer drafting |
| 1.63s | text | final answer continuation |

### 6. Write the interpretation, not just the numbers

The table is necessary but not sufficient. After the table, give the user:

- **Total wall time** and the percentage attributable to the slowest single
  event. (E.g. *"170s total, 71% spent in one tool call."*)
- **What the normal stuff cost.** Sum the deltas that look healthy and say
  *"if the slow event is removed, the rest of the interaction was Xs, which
  is normal for this kind of agentic flow."* This stops the user from
  optimizing things that don't matter.
- **The single bottleneck**, if any. Name it specifically: which Bash
  command, which Read, which model thinking gap. Do not hand-wave.
- **What to do about the bottleneck**, with a concrete next step. If the
  bottleneck is a Bash call that hung, fetch the actual command from the
  JSONL — do not work from the truncated snippet in the watcher output:

      ls -t ~/.claude/projects/-Users-bsampera-Documents-bleak-dev-context-loader-platform-src-context/*.jsonl \
        | head -1 \
        | xargs jq -r 'select(.message.content[0].input.command? // "" | contains("varlock run")) | .message.content[0].input.command'

  Replace `varlock run` with whatever substring identifies the slow call.

### 7. Be honest about what the data does and does not show

If the user came in worried about a specific cost (e.g. "I think the
Infisical call is too slow") and the trace shows that cost is invisible
inside other variability, **say so**. Do not optimize phantom problems just
because the user expected to find one. Quote the actual numbers from the
table to back up the claim.

---

## Reading the deltas: rules of thumb

| Delta range | Before this event | Likely meaning |
|---|---|---|
| < 0.5s | anything | nothing — within normal jitter |
| 0.5–2s | Read / tool_result | tool itself was fast; model was deciding |
| 2–6s | assistant / thinking | model thinking; normal for multi-step reasoning |
| 2–5s | tool_result for varlock+Infisical+remote API | normal full-stack cost; do not optimize |
| 5–30s | tool_result for a Bash with a real query | the query was doing real work; check if bounded |
| > 60s | tool_result | something is wrong; the script is unbounded, hung, or hit a network problem |
| > 120s | tool_result | hit Claude Code's default Bash timeout; the call was probably moved to a background task slot |

Token counts on `assistant` rows: large `in=` values mean the prompt is
heavy (lots of context loaded). Large `out=` values mean the model is
generating a lot. Both translate to wall time on the model side.

---

## What this method does NOT measure

- **Anthropic-side latency** (queueing, rate limits, model routing). For
  that, run `ANTHROPIC_LOG=debug claude -p "..."` directly and look at
  `retry-after` and `anthropic-ratelimit-*` headers.
- **Network breakdown of a single Bash call.** The watcher sees "Bash took
  Ns" but not "of which Infisical was 200ms and Firestore was 2.8s." For
  that, instrument the script the agent runs (add `time.perf_counter()`
  prints around each step) and re-run.
- **Streaming token-by-token model latency.** The JSONL records events at
  block boundaries, not per-token. For per-token latency, use Claude Code's
  `--include-partial-messages` stream-json output directly.

These are usually unnecessary. The transcript is enough 90% of the time.

---

## Cleanup

The watcher writes only to `/tmp/claude-timing.log` and `/tmp/claude-timing-watch.py`.
Both are in `/tmp` and will be cleared on next reboot. Nothing else is
created or modified.
