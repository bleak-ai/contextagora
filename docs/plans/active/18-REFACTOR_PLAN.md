# Context Loader — Refactor Plan

> What to change, why, and in what order. Organized by net impact on system complexity.

---

## 1. Reduces complexity

These changes delete more code than they add. Do them first.

### 1.1 Config layer

**Current problem:** Configuration is scattered across the codebase as `os.getenv()` calls with inline defaults. `CONTEXT_DIR` is imported lazily to dodge a circular import (acknowledged in DECISIONS.md). There's no single place to see what the system needs to run.

**What to do:**
- Create a single `config.py` using Pydantic Settings (`BaseSettings`).
- Move every env var there: `GH_OWNER`, `GH_REPO`, `GH_BRANCH`, `CONTEXT_DIR`, `MODULES_REPO_DIR`, Infisical credentials, any feature flags.
- Instantiate once at startup, import the instance everywhere.
- Pydantic Settings gives you typed fields, validation on startup (fail fast if a required var is missing), `.env` file support for local dev, and documentation of every config value in one place.

**What it replaces:**
- Every `os.getenv()` / `os.environ.get()` call across the codebase.
- The lazy `CONTEXT_DIR` import hack.
- Implicit knowledge of "what env vars does this system need."

**Net effect:** Strictly less code, zero new concepts.

---

### 1.2 Module manifest (`module.yaml`)

**Current problem:** Module structure is defined by convention — the system looks for `info.md`, `docs/*.md`, `.env.schema`, `requirements.txt` by scanning the filesystem. The distinction between managed files (auto-generated, not user-editable) and preserved files (survive reload) is maintained via two hardcoded Python sets: `MANAGED_FILES` and `PRESERVED_FILES`. Summary and package auto-detect exist because there's no place to declare these things.

**What to do:**
- Add a `module.yaml` to each module:
  ```yaml
  name: linear
  summary: "Query and manage Linear issues, projects, and teams"
  secrets:
    - LINEAR_API_KEY
  dependencies:
    - linear-sdk
  ```
- Module CRUD reads/writes this manifest instead of inferring structure.
- The backend builds the global `.env.schema` by reading manifests of loaded modules, not by scanning for `.env.schema` files in each module directory.
- `requirements.txt` per module is replaced by the `dependencies` list in the manifest.
- Per-module `.env.schema` files are replaced by the `secrets` list in the manifest.

**What it replaces:**
- `MANAGED_FILES` / `PRESERVED_FILES` sets — gone. The manifest defines what a module is; everything else in the module dir is content.
- Per-module `.env.schema` files — secrets are in the manifest.
- Per-module `requirements.txt` files — dependencies are in the manifest.
- The auto-detect packages feature — still useful, but now it writes to the manifest instead of a separate file.
- Summary generation writes to the manifest instead of... wherever it goes now.

**Migration path:** Write a one-time script that reads each existing module's `.env.schema` and `requirements.txt`, generates a `module.yaml`, and deletes the old files. The git repo structure changes, so this is a breaking change for the module repo — but since there's one repo per deployment, it's a coordinated migration.

**Net effect:** Fewer files per module, one source of truth, eliminates two Python sets and the file-scanning logic.

---

### 1.3 Anthropic SDK for non-interactive calls

**Current problem:** Every AI call goes through `claude -p` as a subprocess — including one-shot calls like benchmark judging, summary generation, and package auto-detect. This means:
- Spawning a full CLI process for a single API call.
- Parsing stdout text with fragile regexes (the judge uses `pass:`/`fail:` string matching).
- No structured output — you get a string and hope for the best.
- Slower than a direct API call (CLI startup overhead, session initialization).

**What to do:**
- Add the `anthropic` Python SDK as a dependency.
- Create a thin `llm.py` service (or expand the existing `llms.py`) with functions like:
  ```python
  async def judge_benchmark(prompt: str, output: str) -> JudgeResult:
      ...
  async def generate_summary(content: str) -> str:
      ...
  async def suggest_packages(info_content: str) -> list[str]:
      ...
  ```
- Use structured output (tool use or JSON mode) for the judge call — no more regex parsing.
- Keep the CLI subprocess exclusively for the interactive chat, where you need the agent loop, tools, MCP, and session management.

**What it replaces:**
- Subprocess spawning + stdout capture + regex parsing for non-interactive calls.
- The fragile `pass:`/`fail:` judge output parsing.

**What it does NOT replace:**
- The chat subprocess. That stays as `claude --output-format stream-json`. The CLI gives you the full agent loop for free — reimplementing that with the SDK would be a massive increase in complexity.

**Net effect:** Faster non-interactive AI calls, structured responses, less fragile parsing code. The SDK is one dependency but replaces a lot of subprocess glue.

---

## 2. Increases complexity (worth it)

These add new concepts or dependencies, but solve real problems that will block you otherwise.

### 2.1 SQLite for local state

**Current problem:** Benchmark tasks and runs are stored as files in the container filesystem. Container rebuild = everything gone. The current escape hatch is download/upload buttons. Session metadata is read from Claude Code's JSONL files, which also live in the container.

**What to do:**
- Add a single SQLite database file, mounted as a Docker volume so it survives rebuilds.
- Store: benchmark tasks (the YAML content), benchmark run results (verdict, timing, token counts, context fingerprint), and optionally module load/unload history for debugging.
- Use a lightweight migration tool (Alembic is overkill — consider `sqlite-migrate` or just a `migrations/` folder with numbered SQL files applied on startup).
- Keep the API layer thin: a `db.py` module with a connection pool and a few query functions, not an ORM.

**What it does NOT store:**
- Module content — git repo stays the source of truth.
- Chat sessions — Claude Code's native JSONL files stay the source of truth.
- Secrets — Infisical stays the source of truth.

**Complexity cost:**
- One new dependency (sqlite3 is in Python's stdlib, so really just the migration tooling).
- Schema design and migration discipline.
- A mounted Docker volume in the compose file.

**Why worth it:** Every user will eventually lose benchmark data to a container rebuild. "Download your data before rebuilding" is not a real persistence strategy.

---

## 3. Increases complexity (skip for now)

These are solutions to problems you haven't hit yet. Revisit when you have evidence.

### 3.1 Command plugin system

**Current state:** Two hardcoded commands (`/download`, `/add-integration`) in a structured backend registry with a slash selector UI.

**The proposed change was:** Auto-discovery plugin system where commands are Python modules with a standard interface, dropped into a `commands/` directory.

**Why skip:** You have 2 commands. A plugin system is an abstraction over a list of length 2. The hardcoded registry is ~20 lines of code. When you have 5+ commands and are annoyed at touching the registry for each one, build the plugin system then. Right now it would be architecture for architecture's sake.

**Trigger to revisit:** When adding the 4th or 5th command feels painful.

---

### 3.2 Job queue + runner split

**Current state:** `POST /tasks/{id}/run` blocks a FastAPI worker for the entire benchmark run (can be minutes). Two concurrent runs can interfere because they share `context/`.

**The proposed change was:** Split into API server + task runner connected by a job queue.

**Why skip:** This is real infrastructure — two processes, a queue (even if SQLite-backed), job lifecycle (pending/running/completed/failed), health checks, deployment changes. It solves a real problem, but only if people actually run benchmarks frequently enough to hit the concurrency issue. For a single user running benchmarks occasionally, the synchronous endpoint works.

**Cheaper interim fix if needed:** Add a simple mutex (file lock or asyncio.Lock) that rejects concurrent runs with a 409. One line of defense, no architecture change.

**Trigger to revisit:** When users report blocked requests or want concurrent/scheduled benchmark runs.

---

### 3.3 Workspace isolation for benchmarks

**Current state:** Benchmarks run against the live `context/` directory. A chat session and a benchmark run happening simultaneously could interfere.

**The proposed change was:** Snapshot the workspace per benchmark run.

**Why skip:** Depends on the runner split (3.2) to be useful. Without concurrent runs, there's nothing to isolate from. Also adds filesystem overhead (copying or overlaying the workspace per run).

**Trigger to revisit:** When you implement the runner split and actually support concurrent runs.

---

### 3.4 Frontend restructure

**Current state:** React SPA with chat, modules, and benchmarks as routes. Likely some shared state and component coupling.

**The proposed change was:** Restructure into three independent feature modules sharing only a thin shell.

**Why skip:** This is refactoring for organizational cleanliness, not to fix a bug or enable a feature. If the current structure works and you can find things, don't reorganize. Frontend restructuring is high-churn, low-value work unless the current structure is actively slowing you down.

**Trigger to revisit:** When adding a new feature requires touching 5+ files across unrelated features, or when the bundle size becomes a problem.

---

## Execution order

```
1. Config layer .............. pure simplification, unblocks nothing but cleans the foundation
2. Module manifest ........... changes the data model, do before building new features on top
3. SDK for non-interactive ... independent of 1 and 2, can be done in parallel
4. SQLite .................... do after 1 (config) so DB path is in the config layer
```

Items 1-3 can be done in any order. Item 4 depends on 1. Total scope is moderate — none of these are multi-week efforts.

Items in section 3 (skip for now) should be re-evaluated when their triggers are hit, not on a schedule.
