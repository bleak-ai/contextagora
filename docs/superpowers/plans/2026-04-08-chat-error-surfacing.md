# Plan: Surface chat errors instead of failing silently

**Date:** 2026-04-08
**Spec:** see design discussion 2026-04-08 (inline; no separate spec file).

## Goal

No silent failures in the chat UI. Every error path — backend exceptions, claude CLI missing, non-zero exit, mid-stream crash, dropped SSE connection — must end with a visible red error in the assistant bubble and the UI exiting the "running" state.

## Invariants (after this change)

1. The backend SSE generator **always** emits a final `done` event, even on error.
2. Any error condition emits an `error` event **before** the final `done`.
3. On the frontend, receiving an `error` event is sufficient on its own to (a) display the error and (b) exit the streaming state — it does not depend on a subsequent `done`.
4. If the SSE stream closes without ever seeing `done`, the frontend synthesizes an `error` event ("Connection closed unexpectedly").

## Steps

### Step 1 — Backend: harden `generate()` in `platform/src/routes/chat.py`

**File:** `platform/src/routes/chat.py` (`api_chat` → `generate`)

1. Wrap the entire body of `generate()` in a `try/except Exception` that yields an `error` event with `f"Server error: {e}"` and then a `done` event. Log via `log.exception`.
2. Wrap the `subprocess.Popen(...)` call in its own `try/except (FileNotFoundError, OSError)`:
   - `FileNotFoundError` → `"claude CLI not found on server"`
   - `OSError` → `f"Failed to start claude: {e}"`
   - In both cases, yield `error` then `done`, then `return`.
3. After the existing `proc.wait()` block:
   - If `returncode != 0`, yield `error` (using stderr if present, else `f"claude exited with code {proc.returncode}"`).
   - **Always** yield a final `done` event (move the existing `done` emission out of the `if returncode != 0` branch so it fires unconditionally on this path).
4. Audit the existing loop: the current code already emits `done` on the `result` event type. That's fine — keep it. The post-`wait()` `done` is a backstop for the case where `result` never arrived.

**Verification:**
- `uv run pytest` (if backend tests exist for this route) — otherwise manual: temporarily rename `claude` on PATH (or set `cmd[0]` to `"claude-nonexistent"` in a scratch run) and confirm an `error` SSE event is emitted.

### Step 2 — Frontend store: make `error` self-terminating

**File:** `platform/frontend/src/hooks/useChatStore.ts`

In the `streamChat` `onEvent` switch, change the `case "error"` branch (currently lines ~226-231) from:

```ts
case "error":
  updateAssistant((m) => ({ ...m, error: event.message }));
  break;
```

to:

```ts
case "error":
  updateAssistant((m) => ({ ...m, error: event.message, streaming: false }));
  set({ streamingSessionId: null, abortController: null });
  queryClient.invalidateQueries({ queryKey: ["sessions"] });
  break;
```

Rationale: an error event must be sufficient on its own to exit the running state, even if `done` never arrives.

**Verification:** with the backend hardening from Step 1 in place, trigger any backend error and confirm the composer's Stop button reverts to Send.

### Step 3 — Frontend transport: detect stream-closed-without-done

**File:** `platform/frontend/src/api/chat.ts`

In `streamChat`:

1. Add `let sawDone = false;` before the read loop.
2. Inside the dispatch where `onEvent({ type: currentEventType, ... })` is called, set `sawDone = true` when `currentEventType === "done"`.
3. After the `while` loop exits normally (i.e. `done` from `reader.read()`), if `!sawDone`, call:
   ```ts
   onEvent({ type: "error", message: "Connection closed unexpectedly" });
   ```

Do **not** add this synthetic event in the `AbortError` path — the existing `.catch` in `useChatStore.ts` already handles user-initiated cancel correctly.

**Verification:** kill the backend process mid-stream (e.g., `Ctrl+C` the dev server while a chat is running) and confirm the assistant bubble shows the red "Connection closed unexpectedly" message and the composer returns to Send.

### Step 4 — Manual end-to-end verification

Run through each error class and confirm a visible red error + UI returns to idle:

| Class | How to trigger | Expected message |
|---|---|---|
| Backend exception in route | Add a temporary `raise RuntimeError("test")` near the top of `generate()`, hit chat, then revert | `Server error: test` |
| claude binary missing | Temporarily set `cmd[0] = "claude-nope"`, hit chat, revert | `claude CLI not found on server` |
| claude non-zero exit | Send a prompt that makes claude exit non-zero (or temporarily add `cmd.append("--bogus-flag")`) | stderr contents, or `claude exited with code N` |
| SSE drop mid-stream | Kill backend process mid-response | `Connection closed unexpectedly` |
| Fetch-level failure | Stop backend, send a chat | Existing `.catch` path: `Chat request failed: ...` |

All five must show a red error in the assistant bubble and leave the composer in the Send (not Stop) state.

## Out of scope

- Retry / regenerate affordances.
- Toast notifications or a global error boundary.
- Categorizing or styling errors differently by type.
- Persisting an "errored" status separately — `msg.error` is already persisted by the existing zustand `persist` middleware.

## Files touched

- `platform/src/routes/chat.py` — Step 1
- `platform/frontend/src/hooks/useChatStore.ts` — Step 2
- `platform/frontend/src/api/chat.ts` — Step 3

No new files. No new dependencies. No new UI components (the `__ERROR__` rendering path in `Thread.tsx:78` is reused as-is).
