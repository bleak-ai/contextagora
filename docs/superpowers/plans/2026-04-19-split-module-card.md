# Split `ModuleCard.tsx` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `platform/frontend/src/components/sidebar/ModuleCard.tsx` (621 lines) into four focused files under `cards/` — `ModuleCardShell`, `IntegrationCard`, `TaskCard`, `ModuleFilePreview` — preserving current UX exactly and keeping call sites dispatched by `info.kind`.

**Architecture:** No facade. Call sites (`ContextPanel`, `WorkspaceGroup`) render `<TaskCard>` or `<IntegrationCard>` directly based on `info.kind`. Both cards use a shared `ModuleCardShell` for the outer frame + header chrome (tone-driven border/bg/dot, edit button). `ModuleCardShell` is pure layout: it owns no expand state. `IntegrationCard` and `TaskCard` each own their own state and body. `ModuleFilePreview` (shared wrapper around `FilePreviewModal`) is factored out so both cards use it.

**Tech Stack:** React 19, TypeScript 5.9, TanStack Query v5, Zustand, Tailwind v4. Build via Vite. **No test framework is installed in `platform/frontend/`** — verification is `tsc -b` (via `npm run build`), `npm run lint`, and manual browser check against the dev server. Adding a test framework is out of scope.

**Spec:** `docs/specs/01-split-module-card.md`

---

## Source of truth

- Original component: `platform/frontend/src/components/sidebar/ModuleCard.tsx` (621 lines)
- Call sites (confirmed via grep):
  - `platform/frontend/src/components/ContextPanel.tsx:24` (import), `:297` (JSX) — active tasks loop
  - `platform/frontend/src/components/sidebar/WorkspaceGroup.tsx:6` (import), `:177` (JSX) — integrations
- `ArchiveModal` does **not** import `ModuleCard` — no changes there.

## Clarifications resolved during planning

1. **Task card body stays always-visible** (summary + files with `FilePreviewModal`). No expand toggle on tasks. `TaskCard` shares `ModuleCardShell` for the header only — current behavioral UX is preserved exactly.
2. **Edit button lives in `ModuleCardShell` unconditionally.** Both kinds render it today; caller passes `onEdit`. Default behavior when `onEdit` is not supplied is owned by the caller, not the shell.
3. **Helpers `statusOf` / `countMissing` stay inline in `IntegrationCard.tsx`.** Single consumer — no `helpers.ts`.
4. **`ArchiveModal` untouched.** Spec step 5b is a no-op.
5. **Line-count cap (~250 lines/file) is a soft target.** `IntegrationCard` body is genuinely ~300 lines; splitting further is out of scope.
6. **No shared `ModuleCardProps` type.** Each card's props are typed locally.

## File structure

All new files under `platform/frontend/src/components/sidebar/cards/`.

| File | Action | Responsibility |
|---|---|---|
| `cards/ModuleCardShell.tsx` | Create | Outer frame + header row. Owns tone→className mapping, status dot, edit button. Pure layout — no state. |
| `cards/ModuleFilePreview.tsx` | Create | Wrapper around `FilePreviewModal` that fetches module file content via `fetchModuleFile`. Reused by both cards. |
| `cards/IntegrationCard.tsx` | Create | Integration logic (loaded + idle). Owns `expanded` state, lazy `useQuery` for detail, `installMutation`, secrets/packages/files sections. Inlines `Section`/`Item`/`Empty`/`Pill` helpers. |
| `cards/TaskCard.tsx` | Create | Task logic. Always-visible body (summary + file list). Owns archive/delete action guards (`archiving` / `deleting` local state). |
| `ContextPanel.tsx:24, :297` | Modify | Import `TaskCard`; render `<TaskCard>` in active tasks loop. |
| `sidebar/WorkspaceGroup.tsx:6, :177` | Modify | Import `IntegrationCard`; render `<IntegrationCard>` in integrations loop. |
| `sidebar/ModuleCard.tsx` | Delete | Removed after all call sites are migrated. |

### Import-path translation (old → new, from `cards/`)

Old files live at `sidebar/` (3 levels deep under `src/`). New files live at `sidebar/cards/` (4 levels deep). Every relative import gains one extra `../`:

| Original (in `ModuleCard.tsx`) | New path (in `cards/*.tsx`) |
|---|---|
| `../../api/modules` | `../../../api/modules` |
| `../../api/workspace` | `../../../api/workspace` |
| `../../hooks/useModuleEditorStore` | `../../../hooks/useModuleEditorStore` |
| `./FilePreviewModal` | `../FilePreviewModal` |

## Shell contract

```tsx
// cards/ModuleCardShell.tsx
export type ModuleCardTone = "ok" | "warn" | "idle" | "task-on" | "task-off";

interface ModuleCardShellProps {
  tone: ModuleCardTone;
  headerMiddle: React.ReactNode;   // name/expand region — integration wraps name in a button; task renders plain span
  headerRight?: React.ReactNode;   // switch (integration) or archive+delete (task)
  onEdit: () => void;
  children?: React.ReactNode;      // body; caller decides whether/when to render
}
```

`tone` → classes (exact mirror of `ModuleCard.tsx:92-116`):

| tone | border | bg | dot |
|---|---|---|---|
| `ok` | `border-accent/50` | `bg-accent/[0.10]` | `bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]` |
| `warn` | `border-red-500/60` | `bg-red-500/[0.08]` | `bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]` |
| `idle` | `border-border opacity-60` | `bg-bg-hover` | `bg-text-muted` |
| `task-on` | `border-accent/70` | `bg-accent/[0.10]` | `bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]` |
| `task-off` | `border-accent/70` | `bg-accent/[0.10]` | `bg-text-muted` |

Shell renders a constant-lookup object (no nested ternaries).

## Execution notes

- Commit steps below follow project convention. Per user preference, only execute `git commit` / `git rm` when explicitly approved.
- Per user preference, avoid `rm` / `rm -rf` — deletion in Task 6 is done via `git rm` (tracked file removal) only after explicit approval.
- Run all `npm` / `npx` commands from `platform/frontend/`.

---

## Task 1: Create `cards/` folder and `ModuleCardShell.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/cards/ModuleCardShell.tsx`

- [ ] **Step 1.1: Create the folder + file**

Create `platform/frontend/src/components/sidebar/cards/ModuleCardShell.tsx`.

- [ ] **Step 1.2: Implement `ModuleCardShell`**

```tsx
import type { ReactNode } from "react";

export type ModuleCardTone = "ok" | "warn" | "idle" | "task-on" | "task-off";

interface ToneClasses {
  border: string;
  bg: string;
  dot: string;
}

const TONE: Record<ModuleCardTone, ToneClasses> = {
  ok: {
    border: "border-accent/50",
    bg: "bg-accent/[0.10]",
    dot: "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]",
  },
  warn: {
    border: "border-red-500/60",
    bg: "bg-red-500/[0.08]",
    dot: "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  },
  idle: {
    border: "border-border opacity-60",
    bg: "bg-bg-hover",
    dot: "bg-text-muted",
  },
  "task-on": {
    border: "border-accent/70",
    bg: "bg-accent/[0.10]",
    dot: "bg-accent shadow-[0_0_6px_rgba(107,138,253,0.6)]",
  },
  "task-off": {
    border: "border-accent/70",
    bg: "bg-accent/[0.10]",
    dot: "bg-text-muted",
  },
};

interface ModuleCardShellProps {
  tone: ModuleCardTone;
  headerMiddle: ReactNode;
  headerRight?: ReactNode;
  onEdit: () => void;
  children?: ReactNode;
}

export function ModuleCardShell({
  tone,
  headerMiddle,
  headerRight,
  onEdit,
  children,
}: ModuleCardShellProps) {
  const t = TONE[tone];
  // Matches original `isOn === false` dim styling in ModuleCard.tsx:210-212.
  // `task-off` = task with no loaded module; also dim.
  const editDim = tone === "idle" || tone === "task-off";
  const editTextClass = editDim
    ? "text-text-muted/50 hover:text-accent/70"
    : "text-text-muted hover:text-accent";

  return (
    <div
      className={`mb-1.5 overflow-hidden rounded-md border ${t.bg} ${t.border}`}
    >
      <div className="flex w-full items-center gap-2 px-2.5 py-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
        {headerMiddle}
        {headerRight}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className={`p-1 rounded hover:bg-accent/10 transition-colors ${editTextClass}`}
          title="Edit module"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 1.3: Verify typecheck**

Run: `cd platform/frontend && npx tsc -b`
Expected: no errors. (Nothing imports the file yet — this confirms the file is valid in isolation.)

- [ ] **Step 1.4: Commit**

```bash
git add platform/frontend/src/components/sidebar/cards/ModuleCardShell.tsx
git commit -m "feat(sidebar): add ModuleCardShell primitive for card header + frame"
```

---

## Task 2: Extract `ModuleFilePreview.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/cards/ModuleFilePreview.tsx`

**Reference:** `ModuleCard.tsx:495-524`

- [ ] **Step 2.1: Create the file**

```tsx
import { useQuery } from "@tanstack/react-query";
import { fetchModuleFile } from "../../../api/modules";
import { FilePreviewModal } from "../FilePreviewModal";

interface ModuleFilePreviewProps {
  moduleName: string;
  path: string;
  onClose: () => void;
}

export function ModuleFilePreview({
  moduleName,
  path,
  onClose,
}: ModuleFilePreviewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["module-file", moduleName, path],
    queryFn: () => fetchModuleFile(moduleName, path),
    staleTime: 30_000,
  });

  return (
    <FilePreviewModal
      title={
        <>
          <span className="text-text-muted">{moduleName}/</span>
          {path}
        </>
      }
      content={data?.content ?? null}
      isLoading={isLoading}
      error={!!error}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 2.2: Verify typecheck**

Run: `cd platform/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add platform/frontend/src/components/sidebar/cards/ModuleFilePreview.tsx
git commit -m "feat(sidebar): extract ModuleFilePreview wrapper for reuse"
```

---

## Task 3: Create `TaskCard.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/cards/TaskCard.tsx`

**Reference:** `ModuleCard.tsx:51-65, 134-140, 151-156, 231-285, 288-318, 480-486`

- [ ] **Step 3.1: Write the component**

```tsx
import { useState } from "react";
import type { ModuleInfo } from "../../../api/modules";
import type { LoadedModule } from "../../../api/workspace";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";

interface TaskCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onArchive?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onEdit?: () => void;
}

export function TaskCard({
  info,
  loaded,
  onArchive,
  onDelete,
  onEdit,
}: TaskCardProps) {
  const isOn = loaded !== null;
  const tone = isOn ? "task-on" : "task-off";

  const openModuleEditor = useModuleEditorStore((s) => s.openModuleEditor);
  const handleEdit = () => (onEdit ? onEdit() : openModuleEditor(info.name));

  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const headerMiddle = (
    <div className="flex-1 min-w-0">
      <span className="text-xs font-semibold text-text block truncate">
        {info.name}
      </span>
    </div>
  );

  const headerRight = (
    <>
      {onArchive && (
        <button
          type="button"
          disabled={archiving}
          onClick={(e) => {
            e.stopPropagation();
            setArchiving(true);
            Promise.resolve(onArchive()).finally(() => setArchiving(false));
          }}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-hover transition-colors disabled:opacity-50"
          title="Archive task"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(true);
            Promise.resolve(onDelete()).finally(() => setDeleting(false));
          }}
          className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-bg-hover transition-colors disabled:opacity-50"
          title="Delete task"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      )}
    </>
  );

  return (
    <ModuleCardShell
      tone={tone}
      headerMiddle={headerMiddle}
      headerRight={headerRight}
      onEdit={handleEdit}
    >
      <div className="border-t border-border/50 bg-bg-raised px-3 py-2.5">
        {info.summary && (
          <p className="text-[11px] text-text-muted mb-2">{info.summary}</p>
        )}
        {isOn && loaded.files.length > 0 && (
          <div className="space-y-px">
            {loaded.files.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setPreviewFile(f)}
                className="group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-accent/10"
              >
                <span className="text-[10px] leading-none shrink-0">📄</span>
                <span className="flex-1 truncate text-text font-medium">
                  {f}
                </span>
              </button>
            ))}
          </div>
        )}
        {!isOn && (
          <div className="space-y-1.5 animate-pulse">
            <div className="h-3 w-3/4 rounded bg-text-muted/20" />
            <div className="h-3 w-1/2 rounded bg-text-muted/20" />
          </div>
        )}
      </div>
      {previewFile && (
        <ModuleFilePreview
          moduleName={info.name}
          path={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </ModuleCardShell>
  );
}
```

Note: the `previewFile` modal is rendered inside `ModuleCardShell`'s children. `FilePreviewModal` itself is portal-based / fixed-position, so the visual placement is unchanged.

- [ ] **Step 3.2: Verify typecheck**

Run: `cd platform/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add platform/frontend/src/components/sidebar/cards/TaskCard.tsx
git commit -m "feat(sidebar): add TaskCard component"
```

---

## Task 4: Create `IntegrationCard.tsx`

**Files:**
- Create: `platform/frontend/src/components/sidebar/cards/IntegrationCard.tsx`

**Reference:** `ModuleCard.tsx:25-37` (helpers), `:58-89` (state/queries), `:119-132` (count derivations), `:134-140` (edit fallback), `:158-201` (header/toggle), `:324-475` (body), `:526-621` (Section/Item/Empty/Pill).

- [ ] **Step 4.1: Write the component skeleton + helpers**

Top of file:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchModule, type ModuleInfo } from "../../../api/modules";
import { installModuleDeps, type LoadedModule } from "../../../api/workspace";
import { useModuleEditorStore } from "../../../hooks/useModuleEditorStore";
import { ModuleCardShell } from "./ModuleCardShell";
import { ModuleFilePreview } from "./ModuleFilePreview";

function statusOf(m: LoadedModule): "ok" | "warn" {
  const missingSecret = Object.values(m.secrets).some((v) => v === null);
  const failedPackage = m.packages.some((p) => !p.installed);
  return missingSecret || failedPackage ? "warn" : "ok";
}

function countMissing(m: LoadedModule): number {
  const missingSecrets = Object.values(m.secrets).filter((v) => v === null).length;
  const failedPackages = m.packages.filter((p) => !p.installed).length;
  return missingSecrets + failedPackages;
}

interface IntegrationCardProps {
  info: ModuleInfo;
  loaded: LoadedModule | null;
  onToggle?: (enabled: boolean) => void;
  onEdit?: () => void;
}
```

- [ ] **Step 4.2: Port the component body**

Port the integration-specific logic from `ModuleCard.tsx` into `IntegrationCard`:

1. Compute `isOn`, `status`, derived `tone` (`isOn ? (status === "warn" ? "warn" : "ok") : "idle"`), `missingCount`, `okSecretCount`, `totalSecretCount`, `secretCountLabel`, `secretCountWarn` (mirror `ModuleCard.tsx:52-53, 119-132`).
2. State: `expanded` (`useState(false)`), `previewFile`, `installError` (mirror `:58-77`).
3. Lazy detail query — keep `enabled: expanded && !isOn` (no longer needs the `!isTask` guard since this is the integration component). Mirror `:68-73`.
4. `installMutation` — unchanged from `:79-89`. Preserve the `queryClient.invalidateQueries({ queryKey: ["workspace"] })` call on success.
5. Edit fallback — mirror `:134-140`.
6. Build `headerMiddle` as the expand-toggle button (mirror `:158-180`, drop the `isTask` branch). **Preserve exactly:**
   - Name text class: `${isOn ? "text-text" : "text-text-secondary"}` (`ModuleCard.tsx:164`).
   - Warn badge (`:170-174`) lives **inside** this expand button — rendered only when `!expanded && missingCount > 0`. Do not hoist it to `headerRight`.
   - Caret span (`:175-177`) — `▾` when expanded, `▸` when collapsed.
7. Build `headerRight` as the toggle switch (mirror `:183-201`), only when `onToggle` is passed.
8. Render `<ModuleCardShell tone={tone} headerMiddle={…} headerRight={…} onEdit={handleEdit}>` with body `{expanded && <div className="border-t border-border bg-bg-raised px-3 py-2.5">…</div>}` ported from `:321-477`. The body structure (loaded vs idle with `detail` / `detailLoading`) is unchanged.
9. Render `<ModuleFilePreview moduleName={info.name} path={previewFile} onClose={…} />` when `previewFile` is set (inside the shell's children block).

- [ ] **Step 4.3: Inline `Section`, `Item`, `Empty`, `Pill` helpers**

Paste from `ModuleCard.tsx:526-621` verbatim at the bottom of `IntegrationCard.tsx`. These are the only consumers. No changes needed.

- [ ] **Step 4.4: Verify typecheck and check file size**

Run: `cd platform/frontend && npx tsc -b`
Expected: no errors.

Run: `wc -l platform/frontend/src/components/sidebar/cards/IntegrationCard.tsx`
Expected: ~350-450 lines. (Soft target per Spec §Acceptance — not a hard blocker.)

- [ ] **Step 4.5: Commit**

```bash
git add platform/frontend/src/components/sidebar/cards/IntegrationCard.tsx
git commit -m "feat(sidebar): add IntegrationCard component"
```

---

## Task 5: Wire call sites

**Files:**
- Modify: `platform/frontend/src/components/ContextPanel.tsx:24, :297-307`
- Modify: `platform/frontend/src/components/sidebar/WorkspaceGroup.tsx:6, :177-184`

- [ ] **Step 5.1: Update `ContextPanel.tsx`**

Replace the import on line 24:

```tsx
// Before
import { ModuleCard } from "./sidebar/ModuleCard";
// After
import { TaskCard } from "./sidebar/cards/TaskCard";
```

Replace the JSX at lines 297-307:

```tsx
// Before
<ModuleCard
  key={task.name}
  info={task}
  loaded={loaded.find((m) => m.name === task.name) ?? null}
  onEdit={() => openEditor(task.name)}
  onArchive={async () => { await archiveMutation.mutateAsync(task.name); }}
  onDelete={async () => {
    if (confirm(`Delete task "${task.name}"? This cannot be undone.`))
      await deleteMutation.mutateAsync(task.name);
  }}
/>
// After
<TaskCard
  key={task.name}
  info={task}
  loaded={loaded.find((m) => m.name === task.name) ?? null}
  onEdit={() => openEditor(task.name)}
  onArchive={async () => { await archiveMutation.mutateAsync(task.name); }}
  onDelete={async () => {
    if (confirm(`Delete task "${task.name}"? This cannot be undone.`))
      await deleteMutation.mutateAsync(task.name);
  }}
/>
```

(Only the component name changes. `TaskCard` has no `onToggle` prop — it wasn't passed in this call site anyway.)

- [ ] **Step 5.2: Update `WorkspaceGroup.tsx`**

Replace the import on line 6:

```tsx
// Before
import { ModuleCard } from "./ModuleCard";
// After
import { IntegrationCard } from "./cards/IntegrationCard";
```

Replace the JSX at lines 177-184:

```tsx
// Before
<ModuleCard
  key={m.name}
  info={m}
  loaded={loaded.find((l) => l.name === m.name) ?? null}
  onToggle={(enabled) => onToggleIntegration(m.name, enabled)}
  onEdit={() => onEditModule(m.name)}
/>
// After
<IntegrationCard
  key={m.name}
  info={m}
  loaded={loaded.find((l) => l.name === m.name) ?? null}
  onToggle={(enabled) => onToggleIntegration(m.name, enabled)}
  onEdit={() => onEditModule(m.name)}
/>
```

- [ ] **Step 5.3: Grep for stale references**

Use the Grep tool: pattern `ModuleCard`, path `platform/frontend/src`, `-n true`.
Expected: remaining matches are **only** inside `platform/frontend/src/components/sidebar/ModuleCard.tsx` itself (to be deleted in Task 6). No other files reference `ModuleCard` or `./ModuleCard` / `./sidebar/ModuleCard`.

If any external reference remains, update it before continuing.

- [ ] **Step 5.4: Verify typecheck and lint**

Run: `cd platform/frontend && npx tsc -b`
Expected: no errors.

Run: `cd platform/frontend && npm run lint`
Expected: no new warnings/errors introduced by the two modified call sites or the new `cards/` files.

- [ ] **Step 5.5: Commit**

```bash
git add platform/frontend/src/components/ContextPanel.tsx platform/frontend/src/components/sidebar/WorkspaceGroup.tsx
git commit -m "refactor(sidebar): dispatch cards by info.kind at call sites"
```

---

## Task 6: Delete original + final verification

**Files:**
- Delete: `platform/frontend/src/components/sidebar/ModuleCard.tsx`

- [ ] **Step 6.1: Remove the old file** *(confirm with user before running)*

```bash
git rm platform/frontend/src/components/sidebar/ModuleCard.tsx
```

- [ ] **Step 6.2: Full build**

Run: `cd platform/frontend && npm run build`
Expected: `tsc -b && vite build` both succeed, no TypeScript errors, no unresolved imports.

- [ ] **Step 6.3: Lint**

Run: `cd platform/frontend && npm run lint`
Expected: no new errors. (Pre-existing warnings unrelated to this refactor may remain — document them separately if any.)

- [ ] **Step 6.4: Manual browser check** *(ask user to drive this or drive the browser yourself)*

Start the dev server: `cd platform/frontend && npm run dev`. In the browser, verify each of the five card states renders identically to `master`:

1. **Task card (active task, loaded)**: dot accent-colored + task name + archive + delete + edit in header. Body shows summary paragraph (if present) + file list; clicking a file opens `FilePreviewModal` with fetched content. Archive/delete buttons disable themselves during the async action.
2. **Task card (active task, not loaded)**: dot muted, same header layout. Body shows animated skeleton (two gray bars). Edit button is dim (matches original `isOn=false` styling).
3. **Loaded integration card — `ok` state** (all secrets non-null, all packages `installed: true`): accent border/bg, accent dot. Collapsed shows name + caret + switch + edit. Expanding reveals Files / Secrets / Packages sections. Switch toggles on/off.
4. **Loaded integration card — `warn` state** (at least one null secret OR `!installed` package): red border, red dot, "N missing" badge shown when collapsed. Secrets/Packages sections default-open when expanded; "Install packages" button appears if any package failed, and clicking it fires `installModuleDeps` (watch for the `Installing…` state + eventual success/failure).
5. **Idle integration card** (no loaded state): muted border, no switch. Expanding triggers the lazy `useQuery` → schema preview with Secrets/Packages lists (no values, just names).

- [ ] **Step 6.5: Commit the deletion**

```bash
git commit -m "refactor(sidebar): remove ModuleCard after split into cards/"
```

- [ ] **Step 6.6: Final report**

Report back:
- `tsc -b`: clean? (y/n)
- `npm run lint`: clean? (y/n)
- All five manual variants match `master`: pass/fail per variant
- New file line counts: `ModuleCardShell.tsx`, `ModuleFilePreview.tsx`, `TaskCard.tsx`, `IntegrationCard.tsx`

---

## Acceptance (from spec)

- [x] No `ModuleCard.tsx` in the tree (Task 6.1)
- [x] Each new file ≤ ~250 lines — soft cap; `IntegrationCard` likely ~350–450 and that's accepted
- [x] Task / loaded-integration (ok + warn) / idle-integration all render identically to before (Task 6.4)
- [x] `tsc --noEmit` clean (`npm run build` in Task 6.2)

## Out of scope

- Visual redesign (borders, spacing, colors stay identical).
- Adding a test framework / writing tests.
- Splitting `IntegrationCard` further (Section/Item/Empty/Pill stay inline).
- Renaming `sidebar/` or touching any file beyond the four new files, two modified call sites, and the one deleted file.
- Changes to `ArchiveModal`.

## Risk / rollback

Single-session refactor, one PR. If the manual browser check surfaces a regression:
- `git revert` the last ~6 commits (or the merge commit if squash-merged).
- Original `ModuleCard.tsx` is preserved in git history for reference.

No data migrations, no API changes, no user-persistent state touched.
