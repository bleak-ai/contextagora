# Context Loader — System Overview (Phase 1: File Browser POC)

```
                         +------------------+
                         |  Module Registry |
                         |  (git repo / S3) |
                         +--------+---------+
                                  |
                          pull selected modules
                                  |
     +----------------------------+----------------------------+
     |                            |                            |
     v                            v                            v
+----+----------+    +------------+------+    +----------------+--+
|  Container    |    |  Container        |    |  Container         |
|  (Alice)      |    |  (Bob)            |    |  (Carol)           |
|               |    |                   |    |                    |
| +-----------+ |    | +-----------+     |    | +-----------+      |
| | File      | |    | | File      |     |    | | File      |      |
| | Browser   | |    | | Browser   |     |    | | Browser   |      |
| | (web UI)  | |    | | (web UI)  |     |    | | (web UI)  |      |
| +-----------+ |    | +-----------+     |    | +-----------+      |
| | Coding    | |    | | Coding    |     |    | | Coding    |      |
| | Agent     | |    | | Agent     |     |    | | Agent     |      |
| +-----------+ |    | +-----------+     |    | +-----------+      |
| | /context  | |    | | /context  |     |    | | /context  |      |
| |  linear/  | |    | |  supabase/  |     |    | |  linear/  |      |
| |  supabase/  | |    | |  jira/    |     |    | |  slack/   |      |
| +-----------+ |    | +-----------+     |    | +-----------+      |
+---------------+    +-------------------+    +--------------------+
     :8081                :8082                     :8083
       ^                    ^                         ^
       |                    |                         |
       +--------------------+-------------------------+
                            |
                       Browser access
                     (non-coder or coder)
```

---

## Architecture: Sandboxed Container per User

Each user gets a Docker container with a web-based file manager (File Browser). No MCP server, no custom API — just files on disk.

- A Docker container per user running **File Browser** (lightweight web file manager with file tree + editor)
- Context modules are files on disk inside the container
- A coding agent (Claude Code, opencode, etc.) reads files natively from `/context/`
- Non-coders access everything through the browser; coders can also use the terminal/CLI

```
┌─────────────────────────────────────────────────┐
│  Container                                      │
│                                                 │
│  ┌──────────────┐     ┌───────────────────────┐ │
│  │  File Browser │     │  /context/            │ │
│  │  (Web UI)     │────>│    linear/            │ │
│  │              │     │    supabase/            │ │
│  │  [x] linear  │     │    llms.txt           │ │
│  │  [x] supabase  │     └───────────┬───────────┘ │
│  │  [ ] slack   │                 │             │
│  │  [ ] jira    │                 │ reads       │
│  └──────────────┘                 │             │
│                                   v             │
│                          ┌────────────────┐     │
│                          │  Coding Agent  │     │
│                          │  (Claude Code) │     │
│                          └────────────────┘     │
│                                                 │
│  Secrets: varlock run per module at load time    │
└─────────────────────────────────────────────────┘
```

**How it works:**
1. User opens File Browser, picks modules from a picker page
2. Backend copies selected modules into `/context/`
3. Runs `varlock run` to inject secrets
4. Agent reads files natively from disk

**Why this approach for Phase 1:**
- Dead simple — files on disk, nothing else to maintain
- Agent needs zero custom tooling
- Easy to debug (`ls /context/`)
- Works with any agent, not just Claude Code
- Fast to ship and validate the idea

**Known limitations (addressed in Phase 2):**
- Agent is passive — can't discover or load new modules mid-session
- No lazy loading — all selected docs loaded upfront
- Agent doesn't know what modules it *doesn't* have
- Secret lifecycle is manual

---

## Context Storage

Context modules should NOT live permanently baked into the container image.

- **Option A (preferred)**: Modules live in a central store (private git repo, S3, etc.). When a user starts a session and selects modules, only those get pulled into their container. Nothing sensitive persists.
- **Option B**: All modules mounted but agent only sees selected ones via config. Simpler but less secure.
- **Option C**: Encrypted at rest, decrypted per session into tmpfs. Most secure, more complex.

For a small team, Option A is the sweet spot — update modules centrally, containers start clean, only selected context gets loaded.

---

## Agent Access: CLI + UI

Two paths to the same agent:
- **Coders**: use the terminal inside the container, run the coding agent directly from CLI
- **Non-coders**: a simple web UI with a module picker (checkboxes) + chat window. Behind the scenes it launches the same agent with those modules loaded.

---

## Module Format

```
module-name/
  info.md         # metadata about the module
  llms.txt        # navigation/index for all docs
  /docs/          # markdown documentation
  .env.schema     # (optional) secret manifest (Varlock format)
```

Properties:
- **type**: integration, task, knowledge, repository, etc.
- **secrets**: assigned per module, loaded when the module is loaded

---

## Session Flow

**Module selection**: Hybrid approach — config profiles + TUI selector + CLI flags.
```
ctx start                        # uses default profile
ctx start --profile support      # uses named profile
ctx start --modules linear       # explicit override
ctx start -i                     # force interactive TUI
```

**Always-on modules**: Default profile with always-on list, defined in config. Override with `--no-defaults`.

**Context limits**: Tiered loading — module summaries (from `llms.txt`) loaded upfront, full docs fetched on demand, with a token budget cap.

---

## Secrets Management (Varlock)

Each module uses Varlock's `.env.schema` as its secret manifest.

```
supabase-module/
  .env.schema       # declares what secrets the module needs
  .env              # local values (git-ignored)
  docs/
```

```bash
# .env.schema example
# @defaultSensitive=true @defaultRequired=infer
# ---
# @required @sensitive @type=string
DB_PATH=
# @required @sensitive @type=string
DB_USER=
# @type=enum(true, false)
DB_READONLY=false
```

**How it works at runtime**:
1. User selects modules → context loader runs `varlock run` per module
2. Agent reads `.env.schema` to understand what secrets exist (types, constraints) — never sees actual values
3. Secrets injected at execution time: `varlock run -- uv run script.py`

**Why Varlock**: AI-safe by design (agent sees schema, not values), built-in leak prevention, `.env.schema` doubles as the module manifest, type validation included.

---

## Upgrade Path

When mid-session loading and agent autonomy are needed, see **[phase2-hybrid-upgrade.md](phase2-hybrid-upgrade.md)** for the Phase 2 plan (File Browser + MCP Server coordinated via state file).
