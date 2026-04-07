# Varlock: what it is and why this project uses it

> Read this before reasoning about secrets, `.env` files, or `/api/workspace/load` in this codebase.

Varlock is a relatively new tool (github.com/dmno-dev/varlock, varlock.dev). It is *not* "a wrapper around dotenv" and it is *not* "a complicated env var loader." Treating it as either of those will lead you to recommend changes that downgrade this project's security properties while believing you are simplifying it. This document exists because that almost happened.

## The one-line pitch

**Keep secret values out of your repo and out of long-lived process environments. Resolve them at runtime, per command, from a vault.**

## The threat model varlock addresses

The problem varlock solves is **not** "the running program shouldn't be able to read its own secrets" (impossible at the OS level — any process can read its own `os.environ` / `process.env`). The problem is:

1. **Plaintext secrets in repo files.** AI agents, IDE indexers, backup tools, cloud sync, `git grep`, accidental `git add` — every one of them is a leak vector if `.env` exists on disk. Varlock keeps `.env.schema` in the repo (var names + types + a *reference* to where the value lives) and never the values themselves.
2. **Long-lived plaintext in process environments.** A secret injected into a long-running process's env (your shell, your dev server, Claude Code itself) is readable by anything that process spawns, for that process's whole lifetime. Varlock's `varlock run -- <cmd>` model resolves the value, injects it for *one* command, and the env is gone when that command exits.
3. **Accidental echo to terminals/logs.** Varlock pipes the wrapped child's stdout/stderr through `redactSensitiveConfig`, substring-replacing known sensitive values before forwarding to the parent terminal. Best-effort, not a security boundary, but it catches the most common leak mode (an agent helpfully echoing back what it just did).

The marketing line "🤖 AI-safe config — agents read your schema, never your secrets" is about #1: agents that crawl repo files find a schema, not plaintext. It is not a claim that an agent running *under* `varlock run` is somehow blind to the values it has been given. That second thing is impossible and varlock does not claim it.

## How varlock fits this codebase

### The pieces

- **Infisical** — the vault. Holds the actual secret values. Source of truth.
- **Server env vars `INFISICAL_*`** — credentials your FastAPI server uses to authenticate *to* Infisical on behalf of varlock. These bootstrap varlock's plugin; they are not module secrets.
- **Module `.env.schema`** — checked into each module's git repo. Lists the var names a module needs. No values.
- **`augment_schema()` in `platform/src/services/schemas.py`** — at module-load time, your server rewrites the module's `.env.schema` in place, prepending an `@plugin(@varlock/infisical-plugin)` + `@initInfisical(...)` header and turning each `VAR=` line into `VAR=infisical()`. The result is a varlock recipe that says "to fill these names, call the Infisical plugin with these credentials at this path."
- **`varlock run --path context/<module> -- <cmd>`** — at agent-runtime, this reads the augmented schema, calls Infisical, injects the resolved values into `<cmd>`'s environment for the duration of `<cmd>`, then they are gone.

### The two pipelines (read this twice)

Today there are **two independent paths** that both call Infisical:

1. **Server-side validation pipeline.** During `/api/workspace/load`, the server runs `varlock load --format json` once per module to (a) confirm the secrets resolve and (b) get masked previews for the UI. The server **discards the plaintext immediately** and only keeps the masked dict in `_secrets_cache`.
2. **Agent-side runtime pipeline.** When the agent runs a tool command via `varlock run --path context/<module> -- <cmd>`, varlock makes a **separate** call to Infisical, injects the values into `<cmd>`'s environment, runs `<cmd>`, and the values are gone when `<cmd>` exits.

These two pipelines do not share a cache. The server's RAM never holds plaintext for more than the milliseconds between varlock's stdout and the masking step. The agent's runtime path does not benefit from the server's earlier fetch in any way.

This is **the point**. The plaintext exists in the smallest possible number of places for the shortest possible time:
- Never on disk in the workspace.
- In the server's memory: ~milliseconds, then discarded (only masked previews remain).
- In the wrapped command's process env: only for that command's lifetime.

Removing varlock and replacing it with "fetch from Infisical at chat-start, hold in server RAM, inject into Claude Code's process env" looks like a simplification on paper. It is not. It throws away properties varlock is providing for free:

- Per-command env scoping → replaced by chat-lifetime env scoping (much wider window).
- Stdout/stderr redaction → gone entirely.
- "No long-lived plaintext in any process env" → violated; secrets now live in Claude Code's env for the whole session.

The Infisical-call-per-tool-call cost is **the price of those properties**, not overhead to be optimized away.

## Things I didn't know that I should have

If you're an LLM reading this to avoid repeating the mistake that triggered this doc's existence:

1. **`varlock run` pipes the child's stdout/stderr through a redactor by default.** It substring-replaces known sensitive values before forwarding. Source: `packages/varlock/src/cli/commands/run.command.ts`, the `redactSensitiveConfig` call. There's a `--no-redact-stdout` flag to disable it. This is real and it is not "marketing fluff."
2. **Varlock's "AI-safe" claim is about repo files, not runtime isolation.** Don't argue against the runtime-isolation interpretation as if it's what they're claiming. They're not claiming it. They're claiming the schema-in-repo / values-in-vault separation, which is real and useful.
3. **`varlock run -- claude` is an officially recommended pattern.** The varlock docs explicitly suggest using it to inject `ANTHROPIC_API_KEY` into Claude Code itself. This proves they know the wrapped process can read its own env — they would not recommend this pattern if they were claiming otherwise. Treat the docs as honest, not as marketing.
4. **The `@sensitive` flag does more than "mark a value."** Combined with `@redactLogs` (JS-only) and stdout redaction, it participates in real leak-mitigation features. It's not purely metadata.
5. **Schema-only access is the default for file-reading tools.** An agent that reads `context/<module>/.env.schema` directly sees var names and types, not values. This is the intended interaction for any tool that's just trying to understand structure. The only time values come into play is when something invokes `varlock run` or `varlock load`.
6. **The cost model is "one Infisical call per `varlock run` invocation."** If that latency matters, the answer is varlock's own caching (check `--cache` / `VARLOCK_CACHE` in current docs), not "rip varlock out and roll your own." Optimizing the cost without losing the properties is a real engineering problem; assuming the properties don't exist is not.

## The principle to internalize

> **Where the secret lives at runtime is a tradeoff between latency and exposure window. Varlock optimizes for the smallest exposure window. Any "simplification" that widens that window is not a simplification — it is a different point on the tradeoff curve, and the cost is real even if it doesn't show up in lines of code deleted.**

Before recommending removing varlock or replacing it with env injection, `.env` files, or RAM-held secrets, name explicitly:

- Which exposure window are you widening?
- Which redaction property are you giving up?
- Is the latency or complexity gain worth that specific cost?

If you can't answer those three questions, you don't yet understand what varlock is doing, and you should re-read this doc before continuing.

## Reference: where things live in this repo

- `platform/src/services/schemas.py` — `augment_schema()`, the rewriter that turns a passive schema into a varlock recipe.
- `platform/src/services/secrets.py` — `load_module_secrets()`, `load_and_mask_module_secrets()`, `parse_varlock_failure()`. The server-side validation pipeline.
- `platform/src/routes/workspace.py` — `/api/workspace/load`, `/api/workspace/secrets`. The endpoints that drive the validation pipeline.
- Module `.env.schema` files — checked into each module's repo. Var names only.
- `varlock` CLI — must be on `PATH` wherever the server and agent run. Node-based.

## Reference: external

- https://varlock.dev — official docs.
- https://varlock.dev/guides/ai-tools/ — the AI-safety claim and what it does and does not mean.
- https://github.com/dmno-dev/varlock — source. `packages/varlock/src/cli/commands/run.command.ts` for the actual exec/inject implementation.
