# Benchmarks — Status

> A PoC system for running predefined tasks against the currently-loaded
> `context/`, capturing per-phase timing from Claude Code's session JSONL,
> judging the result with a second `claude -p` call, and viewing runs as
> rendered markdown in the web UI. Built so we can answer: *"did changing
> the context make the agent faster / smarter at this task?"*

## What it is

A new `/benchmarks` route in the existing chat UI. Each "task" is a fixed
prompt + a judge prompt. Clicking **Run benchmark** spawns a headless
`claude -p` subprocess against the current `context/` workspace, parses the
resulting session transcript into a phase-by-phase timing table, asks a
second `claude -p` call whether the agent's output satisfied the goal,
and writes the whole thing to a markdown file. Runs are listed per task;
clicking one renders the markdown side-by-side (phase table left, agent
output right).

The benchmark has **no concept of context**. It runs whatever workspace
the user has loaded. Comparing runs = eyeballing two browser tabs.

## How it works

### Flow

1. User defines a task in `platform/src/benchmarks/tasks/<id>.yaml`:
   ```yaml
   id: linear-issues
   description: Retrieve open Linear issues for the current user.
   prompt: |
     List the open Linear issues assigned to me.
   judge_prompt: |
     Did the agent return a concrete list of issues, not just describe it?
     Reply "pass: <reason>" or "fail: <reason>".
   ```
2. User loads modules normally via the Workspace UI.
3. User clicks **Run benchmark** on the task page.
4. Backend spawns `claude -p <prompt>` with `cwd=platform/src/context`,
   stream-json output. It only reads stdout long enough to capture the
   session id from the first `system` event, then drains until exit.
5. Backend locates the session JSONL at
   `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and parses every
   event into a `PhaseEvent(delta_s, event_type, detail, in_tokens,
   out_tokens)`. Logic lifted from `docs/debugging-claude-timing.md`.
6. Backend extracts the agent's final text block, calls `claude -p` again
   with `judge_prompt + agent_output`, and parses the first `pass:`/`fail:`
   line of the reply.
7. Backend hashes the `context/` tree (sha256, first 12 hex chars) as a
   "context fingerprint" so two runs against the same context are
   recognizable.
8. Everything is rendered to markdown via `report.py` and written to
   `platform/src/benchmarks/runs/<task_id>/<ISO-timestamp>.md` (gitignored).

### Backend file layout

```
platform/src/
  routes/benchmarks.py            ← FastAPI routes (4 endpoints)
  services/benchmarks/
    __init__.py
    tasks.py                      ← YAML loader, Task dataclass
    parser.py                     ← session JSONL → ParsedSession
    runner.py                     ← spawns claude -p, orchestrates
    judge.py                      ← second claude -p call for verdict
    report.py                     ← ParsedSession → markdown
    storage.py                    ← read/write/list run files
  benchmarks/
    tasks/linear-issues.yaml      ← seed task
    runs/<task_id>/<ts>.md        ← run outputs (gitignored)
```

### API endpoints (`/api/benchmarks/...`)

- `GET  /tasks`                              — list tasks from YAML
- `POST /tasks/{id}/run`                     — run synchronously, returns when done (minutes)
- `GET  /tasks/{id}/runs`                    — list past runs (newest first)
- `GET  /tasks/{id}/runs/{run_id}`           — return the markdown for one run

### Frontend

- TanStack Router file routes under `platform/frontend/src/routes/benchmarks.*`
- Three pages: list of tasks → task detail (with **Run** button + past runs list) → run detail (markdown render)
- Run detail uses `react-markdown` + `remark-gfm` with custom `.benchmark-md` styles in `src/styles/index.css`
- On large screens the run page is a 2-column layout: **Phase breakdown** table on the left, **Final agent output** (rendered as markdown) on the right
- Sticky header, full-width container, tables horizontally scroll inside a rounded card

### What a run report contains

- Title, timestamp, session id
- Context fingerprint + list of loaded modules
- Total wall time + total in/out tokens
- Judge verdict + one-line reason
- Phase breakdown table (Δ seconds, event type, tool detail, in/out tokens)
- Final agent output (the agent's last assistant text block, rendered as markdown)

## What's been built (chronological)

1. Implementation plan written to `docs/superpowers/plans/2026-04-08-benchmarks-poc.md` after a brainstorming round.
2. Backend pure layer: parser, tasks loader, storage, report renderer + 4 unit tests passing against a synthetic JSONL fixture.
3. Backend subprocess layer: runner + judge + HTTP route + router registered in `server.py`.
4. Frontend: API client, 5 routes (parent + index + task detail + index + run detail), components in `components/Benchmark*.tsx`, nav link in `IconRail.tsx`.
5. Bug fix: parent route `benchmarks.$taskId` was rendering `BenchmarkTaskDetail` directly with no `<Outlet />`, so the `$runId` child route had nowhere to mount. Fixed by splitting into `benchmarks.$taskId.tsx` (layout, `<Outlet />`) + `benchmarks.$taskId.index.tsx` (detail UI).
6. Markdown rendering: installed `react-markdown`, reused/extended the existing `.aui-md` chat styles into a new `.benchmark-md` class (larger fonts, card-styled tables, proper code blocks).
7. Lazy-route cleanup: only `benchmarks.$taskId.$runId` is split into `.tsx` + `.lazy.tsx` (it pulls in `react-markdown`/`remark-gfm`). The other four routes are eager — splitting trivial components added round-trips for no payoff.
8. Run page layout: 2-column grid (phase table | final output), sticky header, tightened padding, dropped the "Tool sequence" section entirely (it was uninformative noise like `Read → Read → Read → Bash`).
9. Final-output rendering: `report.py` no longer wraps the agent's final text in a ` ``` ` fence, so the agent's own markdown (tables, headings) renders properly inside the right column.
10. Stripped the "Tool sequence" section out of existing on-disk runs.

## PoC decisions to revisit before deploying

**These are deliberate shortcuts. Each is fine for a PoC; each will hurt in production.**

### 1. `POST /tasks/{id}/run` is fully synchronous
The HTTP request blocks the FastAPI worker for the entire run — easily
several minutes. Two consequences:
- Browser tab can't close / navigate away cleanly.
- One worker is tied up; other API requests queue behind it.

**Fix when shipping:** background task + polling (or SSE for live status).
A `runs/<id>/status.json` file with `{state: pending|running|done|error,
started_at, finished_at}` would be enough.

### 2. No concurrency control
Two simultaneous runs against the same `context/` will both write to the
same `~/.claude/projects/<encoded-cwd>/` directory and both alter the
shared `context/` files indirectly via tool calls. Session ids stop them
from clobbering each other's transcripts, but the *workspace itself* is
shared.

**Fix:** either serialize runs (lock file / queue) or run each in an
isolated copy of `context/` (temp dir). The second is cleaner but loses
the "test the current workspace" semantics the user explicitly asked for.

### 3. The judge is brittle
- Same model as the agent (Opus 4.6) — overkill and slow. A Haiku call via
  the Anthropic SDK would be cheaper and faster.
- Parses the first `pass:` / `fail:` line of stdout. If the model adds
  preamble, returns markdown, or capitalizes differently, the verdict
  becomes `error`.
- No structured output. No retries. No JSON schema enforcement.

**Fix:** call the Anthropic SDK directly with a structured-output schema
or `tool_use` forcing `{verdict: "pass"|"fail", reason: string}`. Cap
input tokens (long agent outputs currently get sent verbatim).

### 4. Context fingerprint is naive
`_fingerprint()` walks every file in `context/`, reads it whole, and
sha256s the lot. Fine for a few KB; pathological if `context/` grows or
contains binaries. Also order-sensitive in subtle ways (filesystem `rglob`
order varies).

**Fix:** hash file paths + sizes + mtimes, or use a content-addressed
walk that's tested against reorderings.

### 5. Tasks YAML has no schema validation
Tasks now have a CRUD UI (create/edit/delete via the dashboard) and
download/upload of the YAML files. What's still missing: a real schema for
the YAML beyond "must contain `prompt` and `judge_prompt`". Users hand-editing
files on disk can still produce malformed entries, and `load_tasks()`
re-reads the dir on every request (no caching).

**Fix when shipping:** JSON schema for the YAML, and a watch/cache layer
if listing becomes hot. See also #13 for the persistence model.

### 6. Tests cover only the pure layer
- Unit tests exist for `parser.py`, `tasks.py`, `storage.py`, `report.py`
- **No tests** for `runner.py`, `judge.py`, `routes/benchmarks.py`
- The parser test uses a **synthetic** JSONL fixture, not a captured real
  session. If Claude Code changes its transcript format the tests stay
  green but the runner breaks.

**Fix:** capture a real session JSONL into the fixtures dir. Add a route
test that mocks the subprocess. Add an integration test that runs against
a fake `claude` binary on `PATH`.

### 7. No diff view between runs
The user explicitly accepted "two browser tabs is the diff" for the PoC.
With even a handful of runs this becomes tedious — and the *whole point*
of the system is comparing runs.

**Fix:** a simple side-by-side diff page that takes two run ids and
highlights deltas in: total wall time, token totals, tool call count,
phase count, judge verdict. Visualizing the per-phase delta as a stacked
bar would be the killer feature.

### 8. The runner imports `CONTEXT_DIR` lazily inside `run_task()`
Done to dodge a circular import (`server.py → routes/benchmarks.py →
runner.py → server.py`). Works, but it's a smell — `CONTEXT_DIR` is a
config constant and should live in a `config.py` module that both
`server.py` and `runner.py` can import without cycles.

**Fix:** extract `CONTEXT_DIR` (and friends like `PRESERVED_FILES`,
`MANAGED_FILES`) into `platform/src/config.py`.

### 9. Run files are gitignored, not committed
For a PoC this is right — runs are local-only experiments. But it means
runs aren't shareable, can't be diffed across machines, and can't be
reviewed in PRs.

**Fix when productionizing:** decide explicitly whether runs are
ephemeral local artifacts (current) or part of the project's history
(commit them, possibly to a separate `benchmark-runs` branch or repo).

### 10. The runner spawns `claude -p` with the same broad allowedTools
the chat uses (`Bash(*) Read(*) Write(*) Edit(*) Glob(*) Grep(*)`).
Benchmark runs can therefore mutate files in `context/`. That's fine for
"retrieve Linear issues" but a benchmark that asks the agent to *change*
something will leave the workspace in an unexpected state for the next
run.

**Fix:** either snapshot+restore `context/` around each run, or define
read-only vs read-write tasks in the YAML and pass `--allowedTools`
accordingly.

### 11. Final-output extraction is fragile
`parser.py` keeps overwriting `final_text` with the latest assistant text
block, so it ends up as the *last* one. If the agent emits multiple text
blocks (e.g. progress updates → final answer), only the last survives.
If it emits a thinking block after the final answer, `final_text` may be
empty.

**Fix:** concatenate all assistant text blocks, or specifically pick the
last block of the last `assistant` message before the `result` event.

### 12. No way to delete a run from the UI
Runs accumulate forever in `runs/<task>/`. Manual `rm` only.

**Fix:** `DELETE /tasks/{id}/runs/{run_id}` + a trash icon on the run
list. Trivial.

### 13. Tasks and runs are ephemeral (deliberate PoC patch)
Both `tasks/*.yaml` and `runs/<task>/*.md` live in `platform/src/benchmarks/`,
inside the source tree. Runs are gitignored; tasks created via the UI are
written to the source tree but are not part of any persistence layer that
survives a fresh container build. A redeploy that rebuilds the image
loses any UI-created task and any locally-generated run.

**Patch in use:** download/upload buttons exist for both tasks and runs.
Persistence across redeploys is **manual**: download what you care about
before redeploy, re-upload after. Fine when there are 2 tasks and a
handful of runs; will hurt the moment that scales.

**Fix when productionizing:** decide whether tasks belong in `context/`
(shared, versioned with the workspace), a separate `data/` dir (mounted
volume), or a database. The current ephemeral model is a deliberate PoC
patch chosen to avoid coupling benchmarks into `context/` or standing up
storage infra before the feature has proven its value.

## Smoke test

```bash
# 1. backend
cd platform && uv run start

# 2. frontend (separate shell)
cd platform/frontend && pnpm dev

# 3. in the UI: load some modules into the workspace, then visit
#    /benchmarks → linear-issues → Run benchmark → wait → click the new run
```

## Files touched

**Backend (created)**
- `platform/src/routes/benchmarks.py`
- `platform/src/services/benchmarks/{__init__,tasks,parser,runner,judge,report,storage}.py`
- `platform/src/benchmarks/tasks/linear-issues.yaml`
- `platform/src/benchmarks/runs/.gitkeep`
- `platform/tests/benchmarks/{__init__,test_parser,test_tasks,test_storage,test_report}.py`
- `platform/tests/benchmarks/fixtures/sample_session.jsonl` (synthetic)

**Backend (modified)**
- `platform/src/server.py` — registered `benchmarks_router`
- `platform/pyproject.toml` + `uv.lock` — added `pyyaml`
- `.gitignore` — ignore `platform/src/benchmarks/runs/*` (keep `.gitkeep`)

**Frontend (created)**
- `platform/frontend/src/api/benchmarks.ts`
- `platform/frontend/src/routes/benchmarks.tsx`
- `platform/frontend/src/routes/benchmarks.index.tsx`
- `platform/frontend/src/routes/benchmarks.$taskId.tsx`
- `platform/frontend/src/routes/benchmarks.$taskId.index.tsx`
- `platform/frontend/src/routes/benchmarks.$taskId.$runId.tsx`
- `platform/frontend/src/routes/benchmarks.$taskId.$runId.lazy.tsx`
- `platform/frontend/src/components/BenchmarkDashboard.tsx`
- `platform/frontend/src/components/BenchmarkTaskDetail.tsx`
- `platform/frontend/src/components/BenchmarkRunView.tsx`

**Frontend (modified)**
- `platform/frontend/src/components/IconRail.tsx` — added Benchmarks nav link
- `platform/frontend/src/styles/index.css` — added `.benchmark-md` class
- `platform/frontend/package.json` — added `react-markdown`

**Docs**
- `docs/superpowers/plans/2026-04-08-benchmarks-poc.md` — implementation plan
- `STATUS_BENCHMARK.md` — this file
