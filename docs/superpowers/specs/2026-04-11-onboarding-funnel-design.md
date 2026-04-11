# Onboarding Funnel — Design

> Status: design approved 2026-04-11. Pending implementation plan.

## Goal

Help first-time and returning users get from "I have nothing" to "I have run my first real request against an integration I created" with the least friction possible — without changing the core architecture of the app.

The onboarding funnel has three steps:

1. **Discover** — what third parties does my company use that I could integrate?
2. **How-to** — how do I actually add an integration and wire up its secrets?
3. **First request** — run the very first prompt that exercises a real loaded module.

The product's core thesis is that **users build their own integrations**. Default catalogs, marketplaces, or pre-seeded modules would dilute that thesis. Onboarding must teach and guide the *creation* path, not bypass it.

## Constraints

- **No architectural change.** Module storage, the symlink loading model, varlock + Infisical, the benchmark system, and the module editor all stay exactly as they are.
- **Surface-level additions only.** New chat commands, new empty-state UI, one new SSE event type. No new subsystems.
- **Reuse the existing slash command pattern** — backend-intercepted, structured registry, slash selector UI — established by `/add-integration` and `/download`.

## Solution overview

Three additive features:

1. **State-aware empty-state card in the chat panel** — driven purely by the current state of `modules-repo/` and `context/`. Three states (cold / lukewarm / warm), three different messages, click-to-act buttons.
2. **Two new chat commands**:
   - `/introduction` — multi-turn scripted Q&A for cold users (no modules yet). Pulls them through discover → `/add-integration` → first request.
   - `/guide` — one-shot orientation for warm users (modules already loaded). Reads each loaded module's `info.md`, summarizes capabilities, suggests prompts.
3. **"Try this" suggestion at the tail of `/add-integration`** — Claude generates a tailored starter prompt for the freshly created module; the frontend renders it as a clickable suggestion that pre-fills and submits the composer.

## Detailed behavior

### 1. Empty-state card

**Where it lives.** Inside the chat panel's message area, shown only when the conversation has zero user messages in the current session. Replaces the existing "no messages yet" placeholder. Disappears the moment the user sends any message — including a manual one — for the rest of the session.

**State detection.** Three states determined at render time from a new lightweight backend endpoint:

`GET /api/onboarding/state` → `{modules_in_repo: int, modules_loaded: int, loaded_module_names: [str]}`

| State | Condition | Card content | Action |
|---|---|---|---|
| **Cold** | `modules_in_repo == 0` | "👋 Welcome. You don't have any integrations yet — let me walk you through what to add and how." | **[Get started]** → injects `/introduction` into the composer and submits |
| **Lukewarm** | `modules_in_repo > 0 && modules_loaded == 0` | "You have N integrations available but none are loaded. Pick one in the sidebar to get started." | None (hint only) |
| **Warm** | `modules_loaded > 0` | "You have {N} module(s) loaded: {names}. Want a quick tour of what they can do?" | **[Show me]** → injects `/guide` into the composer and submits |

**Click behavior.** Buttons auto-submit, not just pre-fill. The user sees the slash command appear in their message history and the agent's response stream begins immediately. This avoids a "now what?" pause.

**No dismiss button.** The card is state-driven, so dismissal would be meaningless — the moment you act, the conversation has messages and the card is gone for the session anyway.

**State-detection refresh triggers**: chat panel mount, module load/unload from sidebar, module create/delete. No polling.

### 2. `/introduction` command (cold start)

Multi-turn scripted state machine in the same backend pattern as `/add-integration`. The backend intercepts the slash command before it reaches the Claude subprocess and runs its own state machine, emitting assistant messages into the chat stream so the user experience is identical to a normal conversation.

**Five-turn flow:**

1. **Greeting + discovery.** *"Welcome — let's set you up. To suggest the right integrations, tell me: what tools does your team use day-to-day? (e.g., Linear, Slack, Notion, Stripe, Postgres, custom internal APIs.)"* — waits for user reply.

2. **Reflect + recommend.** Backend takes the user's free-text answer and hands it to a one-shot Claude call (`claude -p`, no session) with a tight prompt: *"Given this stack, list the 3 best candidates to integrate first, ranked by ease + payoff. Output as a short numbered list."* Backend posts the result back as an assistant message and asks: *"Which one do you want to start with? (Just type the name.)"*

3. **Explain how integration works** (general — secrets, packages, what gets created). One canned message, no LLM call. Ends with: *"Ready to build the {chosen} integration? I'll launch the wizard."*

4. **Hand off to `/add-integration`.** On the user's confirmation, the `/introduction` state machine ends and the backend programmatically invokes `/add-integration`, pre-seeding it with the chosen service name. The handoff is silent — no synthetic user-style "build the {chosen} integration" message is injected into history. The transition is purely state-internal so the chat history reflects only what the user actually typed. From the user's POV, the conversation continues seamlessly.

5. **(Implicit, owned by `/add-integration`.)** When `/add-integration` finishes, its tail step (Section 3 below) suggests the first prompt — closing the funnel.

**Why a state machine, not LLM-driven**: predictability. Users in onboarding don't know what's possible, and a free-form Claude conversation can drift. The state machine guarantees the user always gets pulled to the next step. Only step 2 (reflect+recommend) needs an LLM call, and it's tightly bounded.

**Cancel behavior**: typing anything that starts with `/` mid-flow aborts the state machine and falls through to that command. Free text inside an expected-input turn is normal flow.

**Backend state location**: per-session in-memory dict keyed by session ID — no persistence. If the server restarts mid-onboarding, the user starts the command again. Acceptable for a 5-turn flow.

**Open dependency**: step 4's "programmatic handoff to `/add-integration` with a pre-seeded service name" assumes that command can be invoked with a starting argument. If it currently can't, that's a small extra change inside `add_integration.py`.

### 3. `/guide` command (warm orientation)

A one-shot command. No state machine, no multi-turn — the backend handler runs once and emits a single assistant message.

**Flow:**

1. User runs `/guide` (either by clicking the Warm-state card button or typing it).
2. Backend handler reads the contents of `context/`. For each loaded module (each top-level symlinked directory), it reads `info.md` and the module's `.env.schema`. The schema tells the prompt builder which secrets are wired up so the suggested prompts only exercise capabilities the module can actually deliver right now (e.g., don't suggest "post a Slack message" if the Slack module is loaded but its `SLACK_BOT_TOKEN` slot is unresolved).
3. Backend builds a prompt for a single `claude -p` call (one-shot, no session, no tool use):

   > *"The user has these context modules currently loaded: {for each module: info.md contents + list of declared secrets}. Write a brief orientation: (1) one-sentence summary per module of what it can do, (2) 2-3 concrete sample prompts they could try right now that exercise these specific modules. Be concise. Format as markdown."*

4. The result is emitted into the chat stream as a normal assistant message.
5. The 2-3 sample prompts in the response are emitted as `suggestion` SSE events (see Section 4 mechanism below) and rendered as clickable pills below the message.

**Why one-shot Claude, not a state machine**: there's no decision tree. The user already has modules loaded; they just need to be told what they can do. A single LLM call generates better, more module-specific orientation than any hand-written template, and the cost is bounded.

**What `/guide` does NOT do:**

- It does not load or unload modules. It only describes what's already loaded.
- It does not store anything. Each invocation re-reads `context/` fresh.
- It does not track which modules the user has "seen guided" — running it twice gives you two reads.

### 4. "Try this" suggestion at the tail of `/add-integration`

The smallest of the three features, but the one that closes the funnel. Two parts: generation, and rendering.

**Generation.** The existing `/add-integration` flow already ends with the module written to `modules-repo/`. Add one final step *before* the command exits: a short `claude -p` call (one-shot, no session) with the freshly created `info.md` in its prompt:

> *"This module was just created: {info.md contents}. Write ONE concrete starter prompt the user could try right now to exercise this integration. Be specific — name a real operation. Output only the prompt, no preamble."*

The result is appended to the final assistant message of `/add-integration` as a structured suggestion — the same mechanism `/guide` uses, built once and shared.

**Rendering — the shared mechanism for both `/guide` and this.** A new SSE event type `{"type": "suggestion", "prompt": "..."}` is added to the chat stream. The backend command handlers emit it alongside text events. The frontend stream parser handles it as a first-class concept and attaches the suggestion to the in-progress assistant message in component state. The renderer displays each attached suggestion as a clickable pill below the message body.

**Why a new event type, not in-message parsing**: the existing event types (`text`, `tool_use`, `thinking`, `result`) already follow this structured pattern — adding `suggestion` is consistent. Asking Claude to wrap suggestions in a sentinel block in the message body would be cheaper but format drift will eventually break it, and the failure mode (suggestion rendered as a code block instead of a button) is worse than the small extra plumbing.

**Click behavior.** Same as the empty-state card buttons: clicking pre-fills the composer **and submits**. No "review before sending" beat.

**Persistence and re-render.** Once a `suggestion` event has been received and attached to its assistant message, it stays attached for the lifetime of the message in component state. When chat history is re-rendered (e.g., switching back to a session), suggestions previously attached to historical messages are NOT re-shown — suggestions are a real-time onboarding affordance, not part of the persisted message record. Clicking a suggestion is therefore only possible on the most recent in-session response that contains one. This matches the project's existing pattern for non-persisted streaming UI (e.g., the live decision tree).

**Scope decision**: `/introduction` does NOT emit a suggestion of its own. Its step-4 handoff to `/add-integration` triggers `/add-integration`'s tail, which produces the suggestion automatically. Adding a separate one in `/introduction` would double up.

## File layout

Nothing in this list is a new subsystem — everything slots into existing files or sits next to them.

### Backend (`platform/src/`)

- `routes/onboarding.py` — **new**. Single endpoint `GET /api/onboarding/state`.
- `services/commands/registry.py` — **modified**. Add `/introduction` and `/guide` to the slash command registry so they appear in the `/` selector UI.
- `services/commands/introduction.py` — **new**. The 5-turn state machine. In-memory per-session state dict. Calls the one-shot LLM helper for step 2. Programmatic handoff to `/add-integration` at step 4.
- `services/commands/guide.py` — **new**. One-shot handler. Reads `context/`, builds the prompt, calls `claude -p`, emits text + suggestion events.
- `services/commands/add_integration.py` — **modified**. Add a final-turn step that generates the suggested first prompt via `claude -p` and emits it as a `suggestion` SSE event. Also accept an optional pre-seeded service name argument from `/introduction`'s handoff.
- `services/streaming.py` (or wherever the SSE event types live) — **modified**. Add the new `suggestion` event type to the union of streamed events and ensure the existing serializer handles it.
- `services/llms.py` — **modified** (small). Add a helper for the bounded one-shot calls used by `/introduction` step 2, `/guide`, and `/add-integration` tail. A single `one_shot(prompt, max_tokens) -> str` function reused by all three.

### Frontend (`frontend/src/`)

- `components/chat/EmptyStateCard.tsx` — **new**. Renders the cold/lukewarm/warm card based on `/api/onboarding/state`. Three branches, one button per non-lukewarm state.
- `components/chat/ChatPanel.tsx` (or equivalent) — **modified**. Mount `EmptyStateCard` when the message list is empty. Re-fetch onboarding state on (a) mount, (b) module load/unload, (c) module create/delete.
- `components/chat/SuggestionButton.tsx` — **new**. The clickable "Try this" pill. Receives a prompt string; on click, pre-fills the composer and submits.
- `lib/streamParser.ts` (or wherever stream events are dispatched) — **modified**. Add a branch for the new `suggestion` event type, attach the suggestion to the in-progress assistant message in component state.
- `components/chat/MessageRenderer.tsx` (or equivalent) — **modified**. When rendering an assistant message that has attached suggestions, render `<SuggestionButton>` for each below the message body.
- `components/chat/SlashCommandSelector.tsx` (or equivalent) — **modified**. Pick up the two new commands from the registry — likely automatic if data-driven, otherwise add `/introduction` and `/guide` entries.

### No changes to

- Module storage / git sync
- Varlock / Infisical / secrets handling
- Symlink loading model
- Module editor
- Benchmarks
- Static `.claude/commands/*.md` files (these new commands are backend-intercepted, not Claude Code native)
- `CLAUDE.md` in `context/`

### Tests

- Unit tests for the `/introduction` state machine (transitions, abort behavior).
- Unit test for the `/guide` prompt builder.
- Mocked subprocess test for the `/add-integration` tail step.
- Frontend: a render test for `EmptyStateCard` covering all three states.
- No e2e — not worth the cost for surface UI work like this.

## Rejected alternatives

These were considered during brainstorming and explicitly rejected. Recording the rationale so future readers don't relitigate.

- **Default public demo repo with seeded modules.** Highest impact and cheapest to ship, but contradicts the product thesis — users should *create* integrations, not consume defaults. Rejected by the user explicitly.
- **AI-bootstrap modules from a docs URL / OpenAPI / README.** Powerful, but a feature for `/add-integration` itself, not onboarding. Out of scope.
- **First-run setup wizard for infra (`GH_OWNER`, Infisical, etc.).** Would change setup flows; out of scope. The current design works regardless of how the user got the system installed.
- **Local "scratch" module before git/vault.** Would require touching the symlink/load model. Out of scope per the no-architecture-change constraint.
- **Pre-built module marketplace / one-click install.** Same reason as default demo repo — turns users into consumers.
- **Hosted public demo at a URL.** Marketing concern, not a self-host onboarding solution.
- **Inline module preview / dry-run while editing.** Useful, but a feature for the module editor, not onboarding.
- **Auto-provision the modules repo via a GitHub PAT.** GitHub-only, PAT-scope concerns, ugly failure modes for small total time saving.
- **Static `start.md` in the Foundation sidebar section.** Passive — users have to find it. Lowest activation rate of the considered options.
- **In-UI guided tour overlay (Shepherd / driver.js).** Tours get skipped; doesn't fix anything, just narrates.
- **`/explain` as the warm-orientation command name.** Renamed to `/guide` per user preference — `/explain` is too vague about what gets explained.
- **Generation source A (static templates) and C (stored in module file) for the suggested first prompt.** Rejected in favor of A: Claude-generated at the moment `/add-integration` finishes, when the module context is already in Claude's head.
- **In-message parsing for suggestion rendering** (sentinel fenced blocks). Cheaper than a new SSE event type but format drift will eventually break it. Rejected in favor of structured streaming.

## Open / deferred

- **`/add-integration` accepting a pre-seeded service name** — assumed by `/introduction` step 4 handoff but not yet verified. If the current command can't take an argument, the implementation plan needs to add that capability.
- **The existing slash command selector** may already be data-driven from the registry; if so, no frontend change is needed for command discoverability. To verify during planning.
- **`info.md` length** — for very large `info.md` files, the `/guide` and `/add-integration` tail prompts may need a token cap. Not blocking; can be handled as a defensive truncation in `services/llms.py`.
