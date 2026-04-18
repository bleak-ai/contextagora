# Spec 01 — Split `ModuleCard.tsx`

## Goal

Break the 621-line `ModuleCard.tsx` into two cohesive cards (`IntegrationCard`, `TaskCard`) that share a header primitive, so each new module kind doesn't bloat a single file further.

## Answers driving this spec

- **Two cards only** (no separate `IdleIntegrationCard`; idle is a mode of `IntegrationCard`).
- **Shared header primitive** is worth extracting.
- **Tasks mirror integrations** — expandable body, same structural shape.
- File layout and facade: choose whichever is cleanest (see plan).

## Current state

`platform/frontend/src/components/sidebar/ModuleCard.tsx` (621 lines) renders three logical variants via nested ternaries (`ModuleCard.tsx:92-116`):

1. **Loaded integration** — expandable, health dot, secrets/packages/install button, toggle switch.
2. **Idle integration** — expandable with lazy `useQuery` for detail, no switch body, muted.
3. **Task** — header + archive/delete actions, no expand.

Used in three places in `ContextPanel.tsx` (active tasks loop, archive modal, and via `WorkspaceGroup` → integration cards).

## Target shape

```
components/sidebar/cards/
  ModuleCardShell.tsx      ← shared frame: border, bg, header row (dot + name + edit)
  IntegrationCard.tsx      ← handles loaded + idle via internal `isOn` check
  TaskCard.tsx             ← mirrors IntegrationCard's expand/collapse shape
```

- **No `ModuleCard.tsx` facade.** Call sites dispatch by `info.kind` directly — three call sites is cheap to update and keeps indirection out.
- **`ModuleCardShell`** owns: outer `<div>`, border/bg class selection (passed as `tone: "ok" | "warn" | "idle" | "task"`), header row (dot + name + edit button). No expand state; children render below the header.
- **`IntegrationCard`** owns: toggle switch, expand state, lazy detail query when idle, secrets/packages list, install-deps button. Expand is header-only when collapsed.
- **`TaskCard`** owns: archive/delete buttons in header, expand state, body that (for now) shows `status.md` preview via `FilePreviewModal` pattern — or leave body empty and flag as TODO. Structure must match `IntegrationCard` so a future task expansion is drop-in.

## Implementation steps

1. Create folder `platform/frontend/src/components/sidebar/cards/`.
2. Extract `ModuleCardShell.tsx`:
   - Props: `{ name, tone, actions, expanded, onToggleExpand, children }`.
   - Owns `cardBgClass` / `borderClass` / `dotClass` mapping — replaces the triple-nested ternary in current code.
3. Create `IntegrationCard.tsx`:
   - Move lines ~75-621 of current `ModuleCard.tsx` concerned with integrations.
   - Uses `ModuleCardShell` for the header.
   - Keeps `statusOf` / `countMissing` helpers (move to a local `helpers.ts` if shared).
4. Create `TaskCard.tsx`:
   - Header with archive + delete actions (current task branch of `ModuleCard`).
   - Body stub: collapsible panel (same structure as integration) — empty `<div>` or minimal "Status coming soon" placeholder is fine for v1.
5. Update call sites in `ContextPanel.tsx`:
   - Active-tasks loop: `<TaskCard … />`
   - `ArchiveModal`: `<TaskCard … />` (if it uses `ModuleCard` today)
   - `WorkspaceGroup` passes `<IntegrationCard … />`
6. Delete `platform/frontend/src/components/sidebar/ModuleCard.tsx`.
7. Grep for stale `ModuleCard` imports; fix.

## Acceptance

- No `ModuleCard.tsx` in the tree.
- Each new file ≤ ~250 lines.
- UI snapshot: task card, loaded integration card (ok + warn), idle integration card all render identically to before (manual check in browser).
- `tsc --noEmit` clean.

## Out of scope

- Visual redesign of cards.
- Task body content (can be empty placeholder; a later spec fills it in).
- Renaming `sidebar/` itself — only adding a `cards/` subfolder.
