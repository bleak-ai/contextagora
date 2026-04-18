# Spec 07 — Chat pipeline cleanups

## Goal

Two small, independent cleanups: cap localStorage growth in `useChatStore`, and split ephemeral tree state out of the chat store.

## Answers driving this spec

- **7a.1 (event registry)** — left blank by user. Default: **keep the linear `if/elif`** for now (5 branches sharing local state; registry not worth the indirection).
- **7a.2 (ChatStream class)** — left blank. Default: **keep closure state in `generate()`** for now. Revisit when a 6th event type forces a rewrite.
- **7b.3 (localStorage cap)** — **(a) Keep last 20 sessions, evict oldest**.
- **7b.4 (tree store split)** — "whatever is cleaner" → **extract `useTreeStore`**. Tree state belongs on a different lifecycle; splitting makes both stores simpler.
- **7b.5 (`NEW_CHAT_KEY` migration)** — leave as-is.

## Scope

Only the two frontend changes. Backend stays untouched this round.

## Current state

`platform/frontend/src/hooks/useChatStore.ts` (311 lines) persists `messagesBySession` to localStorage without eviction. It also owns `currentTreeState` (ephemeral, never persisted) — mixing lifecycles.

## Implementation steps

### A. Session eviction (cap = 20)

1. In `useChatStore.ts`, add a `lastActiveBySession: Record<string, number>` field to the persisted state (timestamp of most-recent message push or SSE event).
2. On every write that mutates `messagesBySession[sessionId]`, update `lastActiveBySession[sessionId] = Date.now()` in the same `set(...)` call.
3. Add a helper (inside the `create(persist(...))` closure):
   ```ts
   const MAX_SESSIONS = 20;
   const evictOldest = (
     messages: Record<string, ChatMessage[]>,
     activity: Record<string, number>,
   ) => {
     const ids = Object.keys(messages);
     if (ids.length <= MAX_SESSIONS) return { messages, activity };
     const keep = ids
       .sort((a, b) => (activity[b] ?? 0) - (activity[a] ?? 0))
       .slice(0, MAX_SESSIONS);
     const keepSet = new Set(keep);
     const nextMessages = Object.fromEntries(
       Object.entries(messages).filter(([id]) => keepSet.has(id)),
     );
     const nextActivity = Object.fromEntries(
       Object.entries(activity).filter(([id]) => keepSet.has(id)),
     );
     return { messages: nextMessages, activity: nextActivity };
   };
   ```
4. Call `evictOldest` after every write that adds a session id (`sendMessage` start, `session` SSE event migration, `deleteSessionMessages`).
5. Exclude `NEW_CHAT_KEY` from the cap (it's migrated to a real id anyway; shouldn't count against the limit).
6. `persist` middleware handles the localStorage write; no manual storage call needed.

### B. Extract `useTreeStore`

1. Create `platform/frontend/src/hooks/useTreeStore.ts`:
   ```ts
   interface TreeStoreState {
     current: TreeState | null;
     reset: () => void;
     apply: (update: TreeState) => void;
   }
   export const useTreeStore = create<TreeStoreState>()((set) => ({
     current: null,
     reset: () => set({ current: null }),
     apply: (update) => set({ current: update }),
   }));
   ```
   Not persisted — tree is live-only per decision.
2. Move the `TreeState` interface from `useChatStore.ts` to the new file (or keep in a shared `types.ts`).
3. Remove `currentTreeState`, `resetTreeState` from `useChatStore.ts`.
4. In the chat store's SSE handler that currently calls `set({ currentTreeState: ... })`, replace with `useTreeStore.getState().apply(...)`.
5. At the top of `sendMessage`, replace `set({ currentTreeState: null })` with `useTreeStore.getState().reset()`.
6. Update `DecisionTreePanel.tsx` to read from `useTreeStore` instead of `useChatStore`.
7. Grep for any other consumer of `currentTreeState` / `resetTreeState` and migrate.

## Acceptance

- Dev tools → Application → localStorage: `messagesBySession` never grows beyond 20 entries after 21+ distinct sessions.
- `useChatStore` has no tree-state fields.
- `DecisionTreePanel` still updates live during streaming.
- `tsc --noEmit` clean.

## Deferred

- Backend `ChatStream` class (spec 07 later pass — pick up when a new event type appears).
- Backend event-handler registry (same — pick up when the `if/elif` chain crosses ~8 branches).
- `NEW_CHAT_KEY` migration refactor (fine as-is).
