# Context Loader — Decisions

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

## Secret management

### Varlock + Infisical, not env injection

Secrets are resolved at runtime per-command via `varlock run`, not injected into the server or agent process environment.

**Why:** The user defended this repeatedly against suggestions to replace varlock with direct env injection: "accept that maybe there are new products like varlock that you're not much aware of." The alternative — hold secrets in RAM or inject into Claude's process env — widens the exposure window (session lifetime vs single command), loses stdout/stderr redaction, and means `printenv` would expose secrets. The per-command Infisical call is the price of keeping plaintext out of long-lived process state. Full rationale in `docs/varlock.md`. **Rejected:** Python shim calling Infisical directly, `subprocess.Popen(env=...)` injection, pre-resolved `.env` files per session.

### No local .env files, ever

Secrets are stored exclusively in Infisical. No `.env` files on disk.

**Why:** The user explicitly stated: "I want to proceed with the infisical integration because I don't want to have the .env saved locally." Every `.env` file is a leak vector for AI agents, IDE indexers, backup tools, and `git add`.

### Platform credentials separated from module schemas

The Infisical bootstrap credentials (`INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, etc.) are platform-level env vars passed to the Docker container. They do NOT live in module `.env.schema` files.

**Why:** The user insisted: "the infisical variables CANNOT live in the .env.schema, they are platform base, it doesn't even make any sense." Module schemas declare what secrets the module needs. How to authenticate to the vault is the platform's concern.

### Modules stay "dumb" — augmentation happens at load time

Module `.env.schema` files in the git repo are simple: just variable names (`LINEAR_API_KEY=`). At workspace load time, the platform enriches these with Infisical plugin config (`@plugin`, `@initInfisical`, `=infisical()` resolvers).

**Why:** Clean separation. Module authors write simple schemas. The platform owns the "how" (Infisical config injected at load time). Modules are portable — they work regardless of whether the deployer uses Infisical, 1Password, or something else. **Rejected:** Modules self-containing Infisical config (tried first, but it mutates the git clone and couples modules to a specific vault provider).

### Global `context/.env.schema` instead of per-module augmented schemas

Instead of writing per-module augmented schemas to `context/.schemas/<name>.env.schema`, generate ONE global `context/.env.schema` that merges all loaded modules' secrets. Multiple `@initInfisical` blocks with `id` parameters target different vault paths. The agent runs `varlock run --` from context root with no `--path` flag.

**Why:** The user said: "I don't like this whole enrichment, it feels complicated. Why do we even need it? Can we just have a global .env.schema in the root folder under context/?" This eliminated the `.schemas/` directory, simplified CLAUDE.md instructions, and removed the need for per-module `--path` args. **Rejected:** Per-module `.schemas/` directory (broke with symlinks), per-file symlink replacement, injecting secrets server-side.

### Varlock runs from context root, no --path flag

`varlock run -- <command>` is always run from `platform/src/context/`, never from a module subdirectory.

**Why:** The global `.env.schema` lives at the context root. Running from a subdirectory would miss it. Simpler agent instructions too.

### Module dependencies via requirements.txt, installed at load time

Each module can declare Python dependencies in a `requirements.txt`. At workspace load, `uv pip install -r` installs them into the platform's single shared venv.

**Why:** Modules using SDKs (stripe, google-cloud-firestore) were downloading dependencies on every script execution via `uv run --with`. The module should declare deps once, installed at load time — same pattern as secrets with `.env.schema`. **Accepted tradeoff:** single shared venv, no per-module isolation, no cleanup on unload.

## Chat and commands

### Chat is a subprocess, not SDK

The chat uses a `claude` CLI subprocess with `--output-format stream-json`, not the Anthropic SDK.

**Why:** The CLI provides session management, tool execution (Read, Write, Bash, etc.), MCP integration, and `.claude/commands/` support for free. Using the SDK would mean reimplementing the agent loop, tool dispatch, and permission model. The subprocess approach also means the agent runs in `context/` with the same environment a user would have locally.

### Stateless chat sessions — read Claude Code's native session files

The backend holds no conversation state. Each message spawns a `claude` subprocess with `--resume`. Sessions are listed by reading Claude Code's on-disk JSONL files (`~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`).

**Why:** The user explicitly rejected both backend and frontend session stores: "Can't we just parse the sessions as how they are saved in claude code and then show them in the sidebar? Why do we have to even replicate any of their logic." **Rejected:** Backend `SessionStore` (deleted), frontend localStorage session IDs.

### Commands are hardcoded in the backend, not Claude Code native commands

Commands like `/download` and `/add-integration` are backend-intercepted slash commands with a structured registry, not `.claude/commands/*.md` files.

**Why:** The user wanted commands triggered from the chat UI (the web frontend), not from the CLI. The backend intercepts the command before it reaches the `claude` subprocess, enabling custom behavior: `/download` returns a file link, `/add-integration` runs a multi-turn conversational wizard that writes modules via existing API endpoints. A `.claude/commands/download.md` file does exist inside `CONTEXT_DIR` so the CLI can find it too, but the orchestration happens in the backend. **Rejected:** Unstructured approach (in favor of a structured command registry with a slash selector UI).

### Module creation via chat command, not web UI

New modules are created through the `/add-integration` chat command — a conversational flow where the agent asks questions and builds the module.

**Why:** The user explicitly rejected a web UI form for module creation: "I would just go for the chat for now, do not create the web ui." The chat flow is more natural for the exploratory process of defining a new integration.

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

Modules follow this structure: `info.md` (main description, editable), `docs/*.md` (additional docs, editable), `llms.txt` (auto-generated), `.env.schema` (declares secret names), `requirements.txt` (declares Python deps). Only `info.md` and `docs/*.md` are user-editable.

### MANAGED_FILES vs PRESERVED_FILES

Two sets govern workspace reload behavior: `PRESERVED_FILES = {"CLAUDE.md"}` — files that survive when modules are reloaded. `MANAGED_FILES = {"llms.txt", ".env.schema", "requirements.txt"}` — auto-generated files that are not user-editable.

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

Dodges a circular import. **Fix:** extract to `config.py`.
