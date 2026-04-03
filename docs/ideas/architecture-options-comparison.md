# MCP Server vs File Browser UI — Architecture Options

Six approaches ranked by practicality for a small-team context loader system.

---

## Option 1: File Browser Only (No MCP)

**Score: 6/10**

The simplest path. Users pick modules through the web UI, files land on disk, the agent reads them directly.

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
1. User opens File Browser, checks modules from a picker page
2. Backend copies selected modules into `/context/`
3. Runs `varlock run` to inject secrets
4. Agent reads files natively from disk

| Pros | Cons |
|------|------|
| Dead simple — files on disk, nothing else | Agent is passive, can't discover new modules |
| No extra services to maintain | No mid-session loading without user intervention |
| Agent needs zero custom tooling | No lazy loading — all docs loaded upfront |
| Easy to debug (just `ls /context/`) | Agent doesn't know what it *doesn't* have |
| Works with any agent, not just Claude Code | Secret lifecycle is manual |

**Best for:** Quick POC, solo users, sessions where you always know what you need upfront.

---

## Option 2: MCP Server Only (No File Browser)

**Score: 5/10**

Everything goes through the MCP server. The agent is the only interface — no web UI for module management.

```
┌──────────────────────────────────────────────────────┐
│  Container                                           │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  MCP Server                                  │    │
│  │                                              │    │
│  │  Tools exposed:                              │    │
│  │   list_modules()                             │    │
│  │   load_module(name)                          │    │
│  │   unload_module(name)                        │    │
│  │   search_docs(query)                         │    │
│  │   get_module_summary(name)                   │    │
│  └──────────────┬───────────────────────────────┘    │
│                 │                                    │
│                 │ tool calls                         │
│                 v                                    │
│        ┌────────────────┐      ┌──────────────────┐  │
│        │  Coding Agent  │      │  /context/        │  │
│        │  (Claude Code) │      │    (managed by    │  │
│        │                │─────>│     MCP server)   │  │
│        └────────────────┘      └──────────────────┘  │
│                                                      │
│  User interacts ONLY through chat                    │
└──────────────────────────────────────────────────────┘
```

**How it works:**
1. User starts a session, talks to the agent
2. Agent calls `list_modules()` to see what's available
3. User says "I need Linear" → agent calls `load_module("linear")`
4. MCP server pulls the module, injects secrets, returns a summary
5. Agent can also search docs, load lazily, discover dependencies

| Pros | Cons |
|------|------|
| Agent is fully autonomous, can self-serve | Non-coders must talk through the agent for everything |
| Lazy loading keeps token budget low | No visual file browsing or editing |
| Mid-session loading is native | Harder to debug — state is behind an API |
| Clean secret lifecycle (MCP controls injection) | Requires MCP-compatible agent |
| Agent understands the module system itself | Slower start — agent has to discover what's needed |

**Best for:** Power users, fully agent-driven workflows, teams where everyone uses the CLI.

---

## Option 3: File Browser + MCP Server (Independent)

**Score: 4/10**

Both systems exist but don't talk to each other. The web UI manages files, the MCP server manages agent tools. They both write to `/context/` independently.

```
┌──────────────────────────────────────────────────────────┐
│  Container                                               │
│                                                          │
│  ┌──────────────┐                ┌───────────────────┐   │
│  │  File Browser │──── writes ──>│                   │   │
│  │  (Web UI)     │               │   /context/       │   │
│  └──────────────┘                │                   │   │
│                                  │    linear/        │   │
│  ┌──────────────┐                │    supabase/        │   │
│  │  MCP Server  │──── writes ──>│    jira/          │   │
│  │              │               │                   │   │
│  └──────┬───────┘                └────────┬──────────┘   │
│         │                                 │              │
│         │ tool calls                      │ reads        │
│         v                                 v              │
│        ┌──────────────────────────────────────┐          │
│        │          Coding Agent                │          │
│        │          (Claude Code)               │          │
│        └──────────────────────────────────────┘          │
│                                                          │
│  ⚠ WARNING: Two writers to the same directory            │
└──────────────────────────────────────────────────────────┘
```

**How it works:**
1. User can load modules via the web UI (files appear on disk)
2. Agent can also load modules via MCP tools
3. Both write to `/context/` — neither knows what the other did

| Pros | Cons |
|------|------|
| Both interfaces available | Race conditions and sync issues |
| Flexible for different user types | Module state can get out of sync |
| Each system works if the other is down | Two systems to maintain with no shared state |
|  | Secrets may be loaded twice or inconsistently |
|  | "Who loaded what?" becomes unanswerable |

**Best for:** Almost nobody. Included for completeness — this is the naive approach to avoid.

---

## Option 4: File Browser as UI, MCP Server as Backend

**Score: 8/10**

The File Browser UI becomes a frontend that talks to the MCP server. The MCP server is the single source of truth for module state. The agent also talks to the MCP server.

```
┌─────────────────────────────────────────────────────────────┐
│  Container                                                  │
│                                                             │
│  ┌──────────────┐         ┌─────────────────────────────┐   │
│  │  File Browser │         │  MCP Server                 │   │
│  │  (Web UI)     │── API ─>│  (single source of truth)   │   │
│  │              │         │                             │   │
│  │  Module       │         │  - module registry          │   │
│  │  Picker       │         │  - secret injection         │   │
│  │  Page         │         │  - state tracking           │   │
│  └──────────────┘         └──────────┬──────────────────┘   │
│                                      │                      │
│                           ┌──────────┴──────────┐           │
│                           │                     │           │
│                           v                     v           │
│                  ┌──────────────┐     ┌──────────────────┐   │
│                  │ /context/    │     │  Coding Agent    │   │
│                  │  (managed    │     │  (Claude Code)   │   │
│                  │   by MCP)    │<────│                  │   │
│                  └──────────────┘     └──────────────────┘   │
│                                                             │
│  Both human and agent go through MCP — one state, one flow  │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
1. File Browser UI has a module picker page that calls MCP endpoints
2. MCP server handles: pulling modules, writing to `/context/`, injecting secrets, tracking state
3. Agent calls the same MCP tools (`load_module`, `list_modules`)
4. File Browser still lets users browse/read files in `/context/` directly
5. Only the MCP server writes to `/context/` — single writer, no conflicts

| Pros | Cons |
|------|------|
| Single source of truth for module state | More complex initial setup |
| Both humans and agents use the same system | File Browser needs custom plugin or proxy page |
| No sync issues | MCP server is a single point of failure |
| Mid-session loading works for both UI and agent | Tighter coupling between components |
| Secret lifecycle is centralized | Requires MCP server to be running before anything works |
| Easy to add audit logging in one place |  |

**Best for:** Production system with mixed coder/non-coder users. The "do it right" approach.

---

## Option 5: File Browser + Agent-Only MCP (Coordinated via State File)

**Score: 9/10**

File Browser handles initial setup (human picks modules). MCP server handles agent-side operations (mid-session loading, discovery). They coordinate through a shared state file — no direct coupling.

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
│  Loose coupling: both read/write .modules.json               │
│  File Browser owns startup, MCP owns mid-session             │
└──────────────────────────────────────────────────────────────┘
```

**`.modules.json` example:**
```json
{
  "loaded": {
    "linear": { "loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user" },
    "supabase": { "loaded_at": "2026-04-01T10:00:00Z", "loaded_by": "user" }
  },
  "available": ["jira", "slack", "stripe", "notion"]
}
```

**How it works:**
1. User picks modules in File Browser at session start → writes to `/context/` + updates `.modules.json`
2. MCP server reads `.modules.json` to know current state
3. Agent calls `list_modules()` → MCP reads `.modules.json` + registry, returns available/loaded
4. Agent calls `load_module("jira")` → MCP pulls module, injects secrets, updates `.modules.json`
5. File Browser can show current state by reading `.modules.json` too

| Pros | Cons |
|------|------|
| Loose coupling — systems work independently | State file can technically get out of sync |
| File Browser stays simple (no custom MCP integration) | Two writers to `.modules.json` (mitigated by file locking) |
| MCP server is optional — system degrades gracefully | Slightly less clean than full MCP backend |
| Easy to build incrementally (File Browser first, MCP later) | Need to define and maintain the state file schema |
| Agent gets full discovery + mid-session loading |  |
| Simple to debug (state is a readable JSON file) |  |
| Both systems can evolve independently |  |

**Best for:** Pragmatic teams that want to start simple and add intelligence later. Ship File Browser first, bolt on MCP when you need agent autonomy.

---

## Option 6: Custom Web UI + MCP Server (No File Browser)

**Score: 7/10**

Drop File Browser entirely. Build a custom web UI (chat + module picker) that talks to the MCP server directly. The MCP server is both the agent backend and the UI backend.

```
┌──────────────────────────────────────────────────────────────┐
│  Container                                                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Custom Web App                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐ │  │
│  │  │  Module Picker   │  │  Chat Interface             │ │  │
│  │  │                 │  │                             │ │  │
│  │  │  [x] linear     │  │  User: check SUP-123       │ │  │
│  │  │  [x] supabase     │  │  Agent: loading linear...  │ │  │
│  │  │  [ ] slack      │  │  Agent: the ticket says... │ │  │
│  │  │  [+] Add module │  │                             │ │  │
│  │  └────────┬────────┘  └──────────────┬──────────────┘ │  │
│  └───────────┼──────────────────────────┼────────────────┘  │
│              │                          │                    │
│              v                          v                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MCP Server                                            │  │
│  │  - serves UI API                                       │  │
│  │  - serves agent tools                                  │  │
│  │  - manages /context/                                   │  │
│  │  - manages secrets                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│              │                                               │
│              v                                               │
│  ┌────────────────┐         ┌──────────────────┐             │
│  │  /context/     │<────────│  Coding Agent    │             │
│  └────────────────┘         └──────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| Tightest integration, best UX | Most code to write and maintain |
| Can show real-time module state in the UI | Loses File Browser's file editing for free |
| Chat + modules in one place | Locked into your custom UI |
| Full control over the experience | Longer time to first working version |
| Can show agent's module loading in real-time in the picker | Need to build file browsing if users want it |

**Best for:** Product you plan to ship to external users. Not for a POC or internal tool.

---

## Ranking Summary

| Rank | Option | Score | When to pick it |
|------|--------|-------|-----------------|
| 1 | **#5 — File Browser + MCP via state file** | 9/10 | Best balance. Ship fast, add smarts later |
| 2 | **#4 — File Browser as UI, MCP as backend** | 8/10 | When you want it clean from day one |
| 3 | **#6 — Custom Web UI + MCP** | 7/10 | When building a product, not an internal tool |
| 4 | **#1 — File Browser only** | 6/10 | Quick POC, validate the idea first |
| 5 | **#2 — MCP only** | 5/10 | CLI-only power users, no non-coders |
| 6 | **#3 — Both independent** | 4/10 | Don't do this |

---

## Recommended Path

```
Phase 1 (now)        Phase 2 (when needed)       Phase 3 (if needed)
─────────────        ────────────────────        ───────────────────
Option #1            Option #5                   Option #4 or #6
File Browser only    Add MCP server              Tighten integration
                     + .modules.json             or build custom UI

Validate the idea    Agent gets autonomy         Production-grade
Ship in days         Loose coupling              Full control
                     Ship in weeks
```

Start with #1, graduate to #5 when you need mid-session loading, consider #4 or #6 only if you're building a product for others.
