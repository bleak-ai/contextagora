# Spec 06 — Decompose `ContextPanel.tsx`

## Goal

Split the 423-line `ContextPanel.tsx` into a shell + three tab bodies + two reusable hooks. Keep task-management mutations in the context-tab body for now (don't prematurely extract a `useTaskActions` hook).

## Answers driving this spec

- Split level: **(b) Medium** — extract hooks + per-tab body components, but no subfolder reshuffle.
- `loadErrors` **scoped to Context tab body**.
- Task-management mutations: user unsure → keep inline in `ContextTabBody.tsx` for now. If a second caller appears (e.g. inside `ModuleEditorModal`), revisit.

## Current state

`platform/frontend/src/components/ContextPanel.tsx` (423 lines) owns:

- Resize logic with `mousemove`/`mouseup` listeners, `localStorage` width persistence (lines 64-103).
- Tab state with `localStorage` key `context-panel-tab` (lines 54-62).
- Collapsed state + collapse/expand button (lines 50, 157-174).
- 3 tab bodies rendered inline (context, tree, sessions).
- `loadErrors` display (lines 325-357).
- Model-label display in header.
- Version footer.

## Target shape

```
components/
  ContextPanel.tsx                   ← shell: header, tabs, resize, version, collapse
  context-panel/
    ContextTabBody.tsx               ← active tasks + workspace + loadErrors + sync
    TreeTabBody.tsx                  ← <DecisionTreePanel />
    SessionsTabBody.tsx              ← session list + new-chat button
hooks/
  useResizablePanel.ts               ← drag handler + localStorage width
  useTabPersistence.ts               ← <T extends string>(key, default) -> [value, set]
```

## Implementation steps

### 1. Extract `useResizablePanel`

`platform/frontend/src/hooks/useResizablePanel.ts`:

```ts
export function useResizablePanel({
  storageKey,
  min,
  max,
  defaultWidth,
}: { storageKey: string; min: number; max: number; defaultWidth: number }) {
  // Owns: width state, mousemove/mouseup listeners, drag ref,
  // localStorage read-on-mount + write-on-release.
  // Returns: { width, startResize }
}
```

Replaces `ContextPanel.tsx:64-103`.

### 2. Extract `useTabPersistence`

`platform/frontend/src/hooks/useTabPersistence.ts`:

```ts
export function useTabPersistence<T extends string>(
  storageKey: string,
  fallback: T,
  valid: readonly T[],
): [T, (next: T) => void] { ... }
```

Replaces `ContextPanel.tsx:54-62`.

### 3. Extract tab bodies

Create `platform/frontend/src/components/context-panel/` with:

- **`ContextTabBody.tsx`** — moves: active-tasks section, divider, workspace section with `<WorkspaceGroup>`, `loadErrors` UI, `<SyncControls>`. Owns its own `showArchiveModal`, `showCreateTask`, `loadErrors` state and mutations.
  - Props: `{ loaded, allModules }` — the panel passes query data down.
- **`TreeTabBody.tsx`** — one-liner wrapping `<DecisionTreePanel />`. (Separate file anyway for symmetry; it's OK to be tiny.)
- **`SessionsTabBody.tsx`** — moves: session list render + "+ New chat" button. Owns the `useSessionStore` wiring.

### 4. Slim `ContextPanel.tsx` to the shell

After the above, the shell owns:

- Collapse state.
- `useResizablePanel` + `useTabPersistence` consumption.
- Header (CONTEXT label, model chip, loaded count badge, collapse button).
- Tab strip (3 buttons).
- Tab-body dispatch: `tab === "context" ? <ContextTabBody/> : tab === "tree" ? <TreeTabBody/> : <SessionsTabBody/>`.
- Version footer.

Target: **~120 lines**.

### 5. Query data ownership

Decide who owns each query:
- `useQuery(["modules"])`, `useQuery(["workspace"])` — keep in `ContextPanel` shell so the loaded-count badge works in header. Pass `loaded` + `allModules` down to `ContextTabBody`.
- `useQuery(["sessions"])` — move to `SessionsTabBody`.
- `useQuery(["root-context"])` — stays inside `WorkspaceGroup` (already there).

## Acceptance

- `ContextPanel.tsx` ≤ 150 lines.
- Each new tab-body file ≤ 250 lines.
- Hooks have no component-specific knowledge (reusable).
- No visual regression (manual browser check across all 3 tabs, collapsed + expanded).
- localStorage keys unchanged (`context-panel-width`, `context-panel-tab`).
- `tsc --noEmit` clean.

## Out of scope

- Redesigning the sidebar layout.
- `useTaskActions` extraction — revisit when a second consumer appears.
- Moving to a subfolder-with-barrel style (`context-panel/index.ts`); direct imports are fine.
