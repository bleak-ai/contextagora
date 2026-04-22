# Context Agora — Decisions

> Architectural decisions and their rationale. Load this when planning features or making changes. For what the system is and how it works, see `STATUS.md`.

## Module storage and loading

### Git repo per tenant, not a cloud registry

Modules are stored in a customer-controlled git repository, configured via `GH_OWNER`/`GH_REPO`/`GH_BRANCH` env vars.

**Why:** Companies may not want module content stored on someone else's infra. A git repo is self-hosted-first — every company already has GitHub/GitLab/Bitbucket, and modules are just text files. A single `MODULES_REPO` config replaces an entire storage backend. **Rejected:** Cloudflare R2+D1 ("overkill for MVP"), Supabase ("not a fan"), SQLite+local FS, Firebase, npm registry.

### Local git clone instead of GitHub API

All module reads/writes go to a local clone (`modules-repo/`). No GitHub Contents API calls per request.

**Why:** The original implementation hit the GitHub API for every module list/read/write. This was slow, rate-limited, and meant every save was an immediate commit. The user identified this: "The current approach where we always are directly uploading to git doesn't make much sense." A local clone gives instant reads, atomic writes, and lets changes batch until the user explicitly pushes. **Rejected:** GitHub Contents API per request (the v1 implementation, reversed after ~4 days).

### Three-layer data model

Files live in three tiers: (1) `context/` — what Claude sees, symlinked; (2) `modules-repo/` — the local git working copy; (3) remote GitHub — source of truth. Editing happens at layer 2, loading symlinks into layer 1, pushing persists to layer 3.

**Why:** Separates "what the agent works with" from "what's committed" from "what's shared." Edits are instant (local FS), persistence is explicit (push), and the agent's workspace is a controlled subset of available modules.

### Symlinks for workspace loading, not copies

`context/<name>` is a symlink to `modules-repo/<name>`, not a copy.

**Why:** The user had three copies of the same data (remote, local clone, and context/ copy) and said "could this be simplified?" With symlinks, agent edits flow directly back into the local clone and surface as dirty git state in the sync UI. With copies, edits would be lost on next load or need a merge mechanism. **Rejected:** Copy-based approach, sync-back-on-demand, filesystem watchers.

### "Remote always wins" on sync pull

`POST /api/sync/pull` does a hard-reset to the remote branch, discarding local changes.

**Why:** Merge conflicts would require a conflict resolution UI we don't have. The simpler model: push first if you have changes you care about. The sync UI shows dirty/ahead/behind state so the user makes an informed choice.

### Ephemeral clone, re-created on startup

The local clone is not persisted via Docker volume. A fresh `git clone` runs on each container start.

**Why:** Modules are text — cloning is fast. Avoids stale state from a volume surviving across image upgrades. The remote repo is always the durable source of truth.

### Tasks are modules with a different scaffold, not a separate concept

A task is a `module.yaml` with `kind: task`. It lives in the same `modules-repo/`, uses the same symlink workflow, is edited through the same editor. The only forks are the scaffolded files (`status.md` instead of richer integration docs) and the auto-load-on-create behavior.

**Why:** One storage model, one sync path, one editor. Introducing a separate "tasks" collection would have duplicated every code path — listing, editing, syncing, archiving. Tasks auto-load because a task the agent can't act on is dead weight. **Rejected:** tasks table / separate directory / separate API — all considered when adding the feature, all rejected as duplication.

### Two-step module save: write files, then register

Module creation and updates from chat follow a two-step pattern: the agent uses `Write` to put `info.md` and `module.yaml` on disk under `modules-repo/<name>/`, then calls `POST /api/modules/<name>/register`. The register endpoint reads the files back, generates `llms.txt`, and auto-loads non-integration modules.

**Why:** Keeps JSON payloads small even for long `info.md` files, lets the agent edit module files exactly like any other workspace file (no special API), and unifies the "register-from-disk" path between chat commands and offline CLI flows like `validate_modules.py`. **Rejected:** single `POST /api/modules` endpoint with the entire module content in the body.

### Archive state lives in the manifest

A module is archived by flipping `archived: true` in its `module.yaml`, not by moving it to a separate directory.

**Why:** Keeps `module.yaml` as the single source of truth for a module's state. Archival is portable (git-synced), reversible with a one-line manifest edit, and doesn't add a new storage location that other code paths need to know about.

## Secret management

### Varlock + Infisical, not env injection

Secrets are resolved at runtime per-command via `varlock run`, not injected into the server or agent process environment.

**Why:** The user defended this repeatedly against suggestions to replace varlock with direct env injection: "accept that maybe there are new products like varlock that you're not much aware of." The alternative — hold secrets in RAM or inject into Claude's process env — widens the exposure window (session lifetime vs single command), loses stdout/stderr redaction, and means `printenv` would expose secrets. The per-command Infisical call is the price of keeping plaintext out of long-lived process state. Full rationale in `docs/varlock.md`. **Rejected:** Python shim calling Infisical directly, `subprocess.Popen(env=...)` injection, pre-resolved `.env` files per session.

### No local .env files, ever

Secrets are stored exclusively in Infisical. No `.env` files on disk.

**Why:** The user explicitly stated: "I want to proceed with the infisical integration because I don't want to have the .env saved locally." Every `.env` file is a leak vector for AI agents, IDE indexers, backup tools, and `git add`.

### Platform credentials separated from module schemas

The Infisical bootstrap credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, etc.) are platform-level env vars passed to the Docker container. They do NOT live in module manifests.

**Why:** The user insisted: "the infisical variables CANNOT live in the .env.schema, they are platform base, it doesn't even make any sense." Module manifests declare what secrets the module needs. How to authenticate to the vault is the platform's concern.

### Modules stay "dumb" — global schema generated at load time

Module `module.yaml` files in the git repo are simple: a `secrets:` list with variable names. At workspace load time, `generate_global_schema()` builds a single `context/.env.schema` with Infisical plugin config (`@plugin`, `@initInfisical`, `=infisical()` resolvers) for all loaded modules.

**Why:** Clean separation. Module authors write simple manifests. The platform owns the "how" (Infisical config generated at load time). Modules are portable — they work regardless of whether the deployer uses Infisical, 1Password, or something else. **Rejected:** Modules self-containing Infisical config (tried first, but it mutates the git clone and couples modules to a specific vault provider). **Superseded:** Per-module `.env.schema` files were replaced by `module.yaml` manifests with a `secrets:` list.

### Global `context/.env.schema` instead of per-module schemas

Instead of per-module schemas, generate ONE global `context/.env.schema` that merges all loaded modules' secrets. Multiple `@initInfisical` blocks with `id` parameters target different vault paths. The agent runs `varlock run --` from context root with no `--path` flag.

**Why:** The user said: "I don't like this whole enrichment, it feels complicated. Why do we even need it? Can we just have a global .env.schema in the root folder under context/?" This eliminated per-module schema files, simplified CLAUDE.md instructions, and removed the need for per-module `--path` args. **Rejected:** Per-module `.schemas/` directory (broke with symlinks), per-file symlink replacement, injecting secrets server-side.

### Varlock runs from context root, no --path flag

`varlock run -- <command>` is always run from `platform/src/context/`, never from a module subdirectory.

**Why:** The global `.env.schema` lives at the context root. Running from a subdirectory would miss it. Simpler agent instructions too.

### Module manifest (`module.yaml`) for secrets and dependencies

Each module declares secrets and Python dependencies in `module.yaml`. At workspace load, secrets feed into the global `.env.schema`, and dependencies are installed via `uv pip install` into the platform's single shared venv.

**Why:** Modules using SDKs (stripe, google-cloud-firestore) were downloading dependencies on every script execution via `uv run --with`. The module should declare deps once, installed at load time. **Superseded:** The original approach used separate `.env.schema` (for secrets) and `requirements.txt` (for deps) files per module. These were consolidated into `module.yaml` for simplicity. **Accepted tradeoff:** single shared venv, no per-module isolation, no cleanup on unload.

### `.env.schema` is pruned on secrets refresh

After each Infisical re-check, `prune_schema_for_resolved` rewrites `context/.env.schema` to exclude any variables that failed to resolve. The UI still shows "missing" state because that display is driven by module manifests, not the schema.

**Why:** A single missing secret used to break `varlock run` for every command, even for modules whose own secrets were fine. Pruning the schema lets `varlock run` succeed for the resolved subset while the UI keeps surfacing the missing ones so the user can fix them in Infisical.

### Install deps is explicit, not automatic on load

Loading a module only creates the symlink. Installing the module's Python dependencies is a separate button backed by `POST /api/workspace/<name>/install-deps`.

**Why:** Load should be instant — it's how the user tells the agent what's in scope. Coupling it to a pip install turned "tick a checkbox" into "wait 30 seconds while the backend downloads wheels." Explicit install also gives the user visible feedback and avoids reinstalling on every reload.

## Chat and commands

### Chat is a subprocess, not SDK

The chat uses a `claude` CLI subprocess with `--output-format stream-json`, not the Anthropic SDK.

**Why:** The CLI provides session management, tool execution (Read, Write, Bash, etc.), MCP integration, and `.claude/commands/` support for free. Using the SDK would mean reimplementing the agent loop, tool dispatch, and permission model. The subprocess approach also means the agent runs in `context/` with the same environment a user would have locally.

### Stateless chat sessions — read Claude Code's native session files

The backend holds no conversation state. Each message spawns a `claude` subprocess with `--resume`. Sessions are listed by reading Claude Code's on-disk JSONL files (`~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`).

**Why:** The user explicitly rejected both backend and frontend session stores: "Can't we just parse the sessions as how they are saved in claude code and then show them in the sidebar? Why do we have to even replicate any of their logic." **Rejected:** Backend `SessionStore` (deleted), frontend localStorage session IDs.

**Superseded 2026-04-21** by "Durable session storage via write-through SQLite" below.

### Durable session storage via write-through SQLite

Reverses the previous decision: the backend now DOES hold conversation state, in a SQLite DB at `~/.claude/contextagora/sessions.db` (override via `SESSIONS_DB_PATH`). Every SSE event the chat route streams to the client is mirrored into the DB via `TranscriptRecorder` + `sessions_store`. The hydrate endpoint reads DB-first and falls back to parsing Claude Code's JSONL only for sessions the server didn't capture (CLI-created or pre-existing).

**Why:** Two concrete failures of the JSONL-only approach emerged in production:
1. Users opening the app from a second computer couldn't see sessions streamed from the first — frontend `messagesBySession` lived in localStorage, so the list appeared but every session hydrated empty.
2. JSONL parsing is coupled to Claude Code's private on-disk format. A format change on their side breaks our hydration silently.

The DB is a write-through cache of what we actually streamed, so it's immune to Claude Code format drift for captured sessions. JSONL remains authoritative for `claude --resume` (we never replace that).

**Rejected alternatives:** (a) Postgres / real DB infra — premature for a single-process deployment; (b) shadow `<id>.messages.json` files next to the JSONL — two files to keep in sync, no benefit over SQLite; (c) dropping the frontend cache entirely and fetching per-render — kills streaming UX.

**How the two stores coexist:** JSONL is the source of truth for *resumption* (Claude Code owns it). SQLite is the source of truth for *display*. They agree by construction while a session is streamed through this server; they diverge only for external sessions, which the JSONL fallback handles.

### Commands are hardcoded in the backend, not Claude Code native commands

Commands like `/download` and `/add-integration` are backend-intercepted slash commands with a structured registry, not `.claude/commands/*.md` files.

**Why:** The user wanted commands triggered from the chat UI (the web frontend), not from the CLI. The backend intercepts the command before it reaches the `claude` subprocess, enabling custom behavior: `/download` returns a file link, `/add-integration` runs a multi-turn conversational wizard that writes modules via existing API endpoints. A `.claude/commands/download.md` file does exist inside `CONTEXT_DIR` so the CLI can find it too, but the orchestration happens in the backend. **Rejected:** Unstructured approach (in favor of a structured command registry with a slash selector UI).

### Module creation via chat command, not web UI

New modules are created through the `/add-integration` chat command — a conversational flow where the agent asks questions and builds the module.

**Why:** The user explicitly rejected a web UI form for module creation: "I would just go for the chat for now, do not create the web ui." The chat flow is more natural for the exploratory process of defining a new integration.

**Superseded:** A `CreateModuleModal` in the sidebar now lets users scaffold an integration directly from the UI. The chat flow remains for conversational/exploratory creation, but the "no web UI, ever" stance was relaxed because a minimal scaffold form is faster for users who already know what they want.

### CLAUDE.md injected as `--append-system-prompt`, not relied on as an on-disk file

For new (non-resumed) chats, the backend reads `context/CLAUDE.md` and passes it to the `claude` subprocess via `--append-system-prompt`.

**Why:** The Claude CLI picks up `CLAUDE.md` automatically, but some Claude-compatible backends routed via `LLM_BASE_URL` do not. Explicit injection makes the root system prompt guaranteed-present regardless of backend. Resumed sessions already have it in context, so injection is skipped there.

### TRY markers — streaming parser, not a structured tool call

Clickable "try this prompt" suggestions are transmitted as `<<TRY: prompt>>` markers embedded in the assistant's own text. A stateful buffer (`SuggestionBuffer`) extracts complete markers from streaming deltas before the text reaches the UI, emitting them as separate `suggestion` SSE events. Partial markers at end-of-stream are silently dropped.

**Why:** Using a structured tool call for suggestions would have added a round-trip per pill and required the agent to break its own reply flow. Inline markers let the prompt author place suggestions right next to the context that produced them, and they work with any model that follows instructions. The rare cost — an unterminated `<<TRY:` at stream end — is acceptable because leaking a partial marker to the user is worse than dropping it.

### LLM backend is pluggable via env vars, not hard-coded to Anthropic

`LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` are mapped to `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and the three `ANTHROPIC_DEFAULT_*_MODEL` env vars at chat subprocess spawn time.

**Why:** Self-hosted deployers may want to route the CLI through OpenRouter, LiteLLM, or an internal proxy. The existing "chat is a subprocess, not SDK" decision would have otherwise locked the platform to direct Anthropic endpoints. Mapping at spawn time keeps the subprocess unchanged while giving deployers a single-env-var override.

### Prompts externalized to markdown, with convention injection

Slash-command prompts moved from inline Python strings (~194 lines in `commands.py`) to `src/prompts/commands/*.md`. Shared conventions (varlock invocation, secret paths, TRY syntax, `module.yaml` fields) live in `_conventions.md` and are injected into any prompt with a `{conventions}` placeholder. The server base URL is injected via `{base_url}`.

**Why:** Prompts are the product's primary surface for agent behavior — they needed to be diffable, editable by non-devs, and free of Python-string escaping overhead. Centralizing conventions means a change to (say) the varlock command shape propagates to every prompt automatically. **Rejected:** per-prompt duplication of convention blocks (worked for ~2 prompts, broke as soon as we hit 5).

## UI decisions

### Backend organization: routes/services split

The monolithic `server.py` (720+ lines) was split into `routes/` (HTTP handlers) + `services/` (business logic), with `models.py` and `llms.py` as shared concerns.

**Why:** The user wanted "better distribution and organisation" not "more features or error handling." Chosen over flat modules (too shallow) and deep sub-packages (too deep for PoC scale).

### Module secrets in UI: just key names, no values, no status

The module management UI shows only which secrets are required (add/remove key names). No values, no "set/missing" indicators.

**Why:** "The chat app takes care of it, not here, this has to be very simple." Secret validation and status display happen after workspace load, in the chat context, not in the module editor.

### Decision tree: generated live, never persisted

The file-access tree visualization is generated on-the-fly from the current streaming session. When switching to a past session, the old tree state is NOT reconstructed.

**Why:** The user explicitly chose this: "I don't want to go back and see which things were found before." The tree is a real-time debugging aid, not a historical record.

### Root context files differentiated from modules

The sidebar shows a "Foundation" section for root `llms.txt` and `CLAUDE.md`, distinct from loadable modules. Root files cannot be unloaded.

**Why:** These files are always present and structurally different from modules. They need to be "differentiated from the modules as they can't be unloaded."

### Static files baked into Docker image, not generated at startup

Files like `.claude/commands/download.md` are placed in the repo at `platform/src/context/.claude/commands/` and copied during Docker build.

**Why:** Simple, versioned in git, no unnecessary runtime complexity.

## Module structure

### Module file convention

Modules follow this structure: `info.md` (main description, editable), `docs/*.md` (additional docs, editable), `module.yaml` (declares name, summary, secrets, dependencies), `llms.txt` (auto-generated). Only `info.md`, `docs/*.md`, and `status.md` are user-editable.

### MANAGED_FILES vs PRESERVED_FILES

Two sets govern workspace reload behavior: `PRESERVED_FILES = {"CLAUDE.md"}` — files that survive when modules are reloaded. `MANAGED_FILES = {"llms.txt", "module.yaml"}` — auto-generated/managed files that are not directly user-editable via the file API.

### context/ is ephemeral

`CONTEXT_DIR` (`platform/src/context/`) lives inside the Docker container. Files created by Claude during a session land here. They do not persist across deploys — the module repo is the durable store.

## Benchmark decisions (PoC shortcuts)

> These are deliberate shortcuts. Each is fine for a PoC; each will hurt in production.

### Fully synchronous run endpoint

`POST /tasks/{id}/run` blocks the FastAPI worker for the entire run (minutes). **Fix when shipping:** background task + status polling.

### No concurrency control

Two simultaneous runs share `context/` and could interfere. **Fix:** serialize runs or snapshot context per run.

### Judge uses same model as agent

The judge call uses Opus 4.6 via `claude -p` — overkill and slow. Also parses stdout with a fragile `pass:`/`fail:` regex. **Fix:** Anthropic SDK call with structured output.

### Naive context fingerprint

Reads every file and sha256s the lot. Pathological for large workspaces. **Fix:** hash paths + sizes + mtimes.

### Tasks and runs are ephemeral

Nothing survives a fresh container build. Download/upload buttons are the persistence escape hatch. **Why (deliberate):** Benchmarks evaluate context — they're not context themselves. Storing them in `context/` would be conceptually wrong. A database is too much infra for an unproven feature. **Fix when productionizing:** mounted volume or database.

### Runner has broad tool permissions

Benchmarks can mutate `context/`. **Fix:** read-only vs read-write in task YAML, or snapshot+restore around each run.

### Final-output extraction keeps only last text block

Multiple assistant text blocks → only last survives. **Fix:** concatenate all, or pick last block before `result` event.

### Tests cover only the pure layer

No tests for runner, judge, or HTTP routes. **Fix:** mock subprocess tests, captured real JSONL fixture.

### No diff view between runs

"Two browser tabs is the diff." **Fix when it hurts:** side-by-side diff page with delta highlighting.

### `CONTEXT_DIR` imported lazily

~~Dodges a circular import.~~ **Fixed:** Extracted to `config.py` as `settings.CONTEXT_DIR`. All imports now go through `from src.config import settings`.
