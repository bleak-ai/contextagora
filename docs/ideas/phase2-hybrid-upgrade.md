# Phase 2: Hybrid Upgrade Plan — File Browser + MCP Server

> **When to upgrade**: When the team needs mid-session module loading, agent-driven discovery, or lazy loading to manage token budgets. The File Browser POC (Phase 1) should be validated first.

---

## What Changes

| Capability | Phase 1 (File Browser Only) | Phase 2 (Hybrid) |
|---|---|---|
| Module loading | User picks at session start | User picks at start + agent loads mid-session |
| Module discovery | Agent doesn't know what's available | Agent calls `list_modules()` to discover |
| Lazy loading | All docs loaded upfront | Summaries first, full docs on demand |
| Secret lifecycle | Manual (`varlock run` at load time) | MCP server manages injection + cleanup |
| State tracking | Implicit (files on disk) | Explicit (`.modules.json` state file) |

---

## Architecture

File Browser handles initial setup (human picks modules). MCP server handles agent-side operations (mid-session loading, discovery). They coordinate through a shared `.modules.json` state file — no direct coupling between services.

```
┌──────────────────────────────────────────────────────────────┐
│  Container                                                   │
│                                                              │
│  ┌──────────────┐     ┌──────────────────────────────────┐   │
│  │  File Browser │     │  /context/                       │   │
│  │  (Web UI)     │────>│    .modules.json  <── state ──┐ │   │
│  │              │     │    linear/                     │ │   │
│  │  Picks       │     │    supabase/                     │ │   │
│  │  modules     │     └──────────────┬───────────────────┘   │
│  │  at start    │                    │                   │   │
│  └──────────────┘                    │ reads             │   │
│                                      v                   │   │
│  ┌──────────────┐           ┌────────────────┐           │   │
│  │  MCP Server  │──tools───>│  Coding Agent  │           │   │
│  │              │           │  (Claude Code) │           │   │
│  │  Reads +     │           └────────────────┘           │   │
│  │  writes      │                                        │   │
│  │  .modules    ├────────────────────────────────────────┘   │
│  │  .json       │                                            │
│  └──────────────┘                                            │
│                                                              │
│  File Browser owns startup, MCP owns mid-session             │
└──────────────────────────────────────────────────────────────┘
```

**Key principle**: Loose coupling. Both services read/write `.modules.json` but don't talk to each other directly. Either can work if the other is down — the system degrades gracefully.

---

## The State File: `.modules.json`

Lives at `/context/.modules.json`. Single source of truth for what's loaded and what's available.

```json
{
  "loaded": {
    "linear": {
      "loaded_at": "2026-04-01T10:00:00Z",
      "loaded_by": "user",
      "version": "1.2.0",
      "has_secrets": true
    },
    "supabase": {
      "loaded_at": "2026-04-01T10:00:00Z",
      "loaded_by": "user",
      "version": "1.0.0",
      "has_secrets": true
    }
  },
  "available": [
    { "name": "jira", "type": "integration", "description": "Jira project management" },
    { "name": "slack", "type": "integration", "description": "Slack messaging" },
    { "name": "stripe", "type": "integration", "description": "Stripe payments" },
    { "name": "notion", "type": "knowledge", "description": "Notion workspace docs" }
  ]
}
```

**Concurrency**: File-level locking (e.g., `flock`) to prevent race conditions between File Browser and MCP server writing simultaneously. In practice, conflicts are rare — File Browser writes at session start, MCP writes mid-session.

---

## MCP Server Design

The MCP server runs inside each container and exposes tools to the coding agent.

### Tools

| Tool | Description | Reads/Writes |
|---|---|---|
| `list_modules()` | Returns loaded + available modules from `.modules.json` | Reads `.modules.json` + registry |
| `load_module(name)` | Pulls module from registry, injects secrets, updates state | Writes to `/context/` + `.modules.json` |
| `unload_module(name)` | Removes module from `/context/`, cleans secrets | Writes to `/context/` + `.modules.json` |
| `get_module_summary(name)` | Returns the `llms.txt` summary without loading full docs | Reads registry |
| `search_docs(query)` | Searches across loaded module docs | Reads `/context/` |

### `list_modules()` Response Example

```json
{
  "loaded": [
    { "name": "linear", "type": "integration", "loaded_by": "user", "doc_count": 12 },
    { "name": "supabase", "type": "integration", "loaded_by": "user", "doc_count": 8 }
  ],
  "available": [
    { "name": "jira", "type": "integration", "summary": "Jira project management — tickets, boards, sprints" },
    { "name": "slack", "type": "integration", "summary": "Slack messaging — channels, messages, users" }
  ]
}
```

### `load_module(name)` Flow

```
Agent calls load_module("jira")
    │
    ├─ 1. Check if already loaded → return early if yes
    ├─ 2. Pull module from registry (git clone / S3 download)
    ├─ 3. Copy into /context/jira/
    ├─ 4. Run varlock run to inject secrets
    ├─ 5. Update .modules.json (add to "loaded", remove from "available")
    └─ 6. Return module summary (llms.txt content) to agent
```

### `get_module_summary(name)` — Lazy Loading

This is the key tool for token budget management. The agent can read summaries of unloaded modules without pulling full docs:

```
Agent: "User asked about a Jira ticket but I don't have Jira loaded"
Agent calls get_module_summary("jira")
→ Returns llms.txt content: what the module contains, doc structure, capabilities
Agent decides: "Yes, I need the full module" → calls load_module("jira")
```

This two-step pattern (summary → load) keeps context lean.

---

## File Browser Changes

Minimal changes to the File Browser from Phase 1:

1. **Module picker writes `.modules.json`** in addition to copying files — add a post-selection hook that creates/updates the state file
2. **Show current state** — optionally read `.modules.json` to display which modules are loaded and by whom (user vs agent)
3. **No MCP integration needed** — File Browser doesn't call the MCP server. It just writes files + state file, same as Phase 1 but with the state file added

The File Browser stays simple. It doesn't need to know the MCP server exists.

---

## Secret Management Upgrade

In Phase 1, `varlock run` is called manually at module load time. In Phase 2, the MCP server owns the secret lifecycle:

```
Module Load:
  MCP server calls varlock run per module → secrets injected into process env

Module Unload:
  MCP server cleans up secret env vars → no lingering credentials

Mid-session Load:
  Agent requests module → MCP handles pull + secret injection atomically
```

### Future: Varlock + Infisical Backend

When the team needs centralized secret management, add Infisical as the storage backend. The module format stays the same — only the backend changes:

```bash
# .env.schema with Infisical backend
# @plugin(@varlock/infisical-plugin)
# @initOp(projectId=$INFISICAL_PROJECT, env=$CONTEXT_ENV, path=/modules/supabase)
# ---
# @required @sensitive @type=string
DB_PATH=
```

| Layer | Tool | Role |
|---|---|---|
| Declaration | Varlock `.env.schema` | What secrets exist, types, constraints |
| Storage | Infisical | Where values live, versioning, RBAC, audit |
| Injection | Varlock `run` via MCP | Runtime injection with leak prevention |
| AI interface | Varlock schema | What the agent sees — structure without values |

---

## Implementation Sequence

```
Step 1: Build MCP server skeleton
  - uv project with MCP SDK
  - Expose list_modules() and load_module() tools
  - Read/write .modules.json

Step 2: Wire into container
  - MCP server starts alongside File Browser in docker-compose
  - Claude Code configured to connect to MCP server (stdio or SSE)

Step 3: Update File Browser module picker
  - Post-selection hook writes .modules.json
  - Existing file copy logic stays the same

Step 4: Add remaining tools
  - unload_module()
  - get_module_summary() for lazy loading
  - search_docs() for cross-module search

Step 5: Secret lifecycle
  - MCP server manages varlock run calls
  - Cleanup on unload
```

---

## When to Consider Phase 3

If the system becomes a product for external users, consider tightening the integration:

- **Option A — MCP as full backend**: File Browser becomes a pure frontend calling MCP API endpoints. Single writer to `/context/`, cleanest architecture. More upfront work.
- **Option B — Custom Web UI**: Drop File Browser entirely, build a custom UI with chat + module picker in one place. Most control, most code to maintain.

Only pursue Phase 3 if you're shipping to external users. For internal/small-team use, Phase 2 (hybrid with state file) is the ceiling.
