# Task Card — differentiate `.py` files with a script icon

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the `TaskCard` body's flat file list, render `.py` files with a distinct icon (`⚡`) so users can visually distinguish runnable scripts from docs without introducing collapsible Sections.

**Architecture:** Single-line change to the file-list renderer in `TaskCard.tsx`. Pick the icon per-item based on filename extension. No split sections (tasks stay "simple flat body"), no backend change, no API change.

**Tech Stack:** React/TypeScript.

**Depends on:** `2026-04-19-split-module-card.md` must land first. This plan targets `platform/frontend/src/components/sidebar/cards/TaskCard.tsx`, which only exists after the split. If that plan hasn't shipped yet, **do not start this plan** — the task body in the pre-split `ModuleCard.tsx` will be thrown away by the split anyway.

**Related context:** Integration cards already partition files into **FILES** (docs) and **⚡ SCRIPTS** (py) as two collapsible Sections — that's integration-specific and lives in `cards/IntegrationCard.tsx`. Tasks deliberately keep a single flat list; this plan only adds a per-item icon tag.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `platform/frontend/src/components/sidebar/cards/TaskCard.tsx` | Modify | Swap the static `📄` icon in the file-list row for one that switches to `⚡` when the filename ends in `.py` |

---

## Task 1: Per-file icon in `TaskCard` body

**Files:**
- Modify: `platform/frontend/src/components/sidebar/cards/TaskCard.tsx`

**Precondition check:**

- [ ] **Step 0: Confirm the split has landed**

Run: `ls platform/frontend/src/components/sidebar/cards/TaskCard.tsx`
Expected: file exists. If it does NOT exist, STOP — run `2026-04-19-split-module-card.md` first and come back.

### Step 1: Locate the file-list row

- [ ] **Step 1: Find the files render block**

Grep for the static `📄` icon in `TaskCard.tsx`:

```
Grep: pattern "📄" in platform/frontend/src/components/sidebar/cards/TaskCard.tsx
```

You're looking for a JSX block like:

```tsx
{isOn && loaded.files.length > 0 && (
  <div className="space-y-px">
    {loaded.files.map((f) => (
      <button
        key={f}
        type="button"
        onClick={() => setPreviewFile(f)}
        className="..."
      >
        <span className="text-[10px] leading-none shrink-0">📄</span>
        <span className="flex-1 truncate text-text font-medium">{f}</span>
      </button>
    ))}
  </div>
)}
```

### Step 2: Swap the static icon for a per-file icon

- [ ] **Step 2: Replace the static `📄` span**

Change `<span className="text-[10px] leading-none shrink-0">📄</span>` to:

```tsx
<span className="text-[10px] leading-none shrink-0">
  {f.endsWith(".py") ? "⚡" : "📄"}
</span>
```

Do NOT change the button `className`, hover behavior, or `onClick` — those stay identical. No new imports. No new state.

### Step 3: Typecheck

- [ ] **Step 3: `pnpm tsc --noEmit`**

Run: `cd platform/frontend && pnpm tsc --noEmit`
Expected: no errors.

### Step 4: Manual verification

- [ ] **Step 4: Browser check**

Start frontend (`cd platform/frontend && pnpm dev`) and verify:
- A task with both `info.md` and `verify.py` (or any `.py`) shows `📄 info.md` and `⚡ verify.py` in the body.
- A task with only `.md` files shows only `📄` icons (no regression).
- A task with only `.py` files shows only `⚡` icons.
- Clicking either still opens `FilePreviewModal` with the Run button appearing for `.py` (behavior delivered by the already-shipped `runnable` prop on `FilePreviewModal`).

---

## Acceptance

- `.py` files in the task body render with `⚡`; non-`.py` files render with `📄`.
- No visual change to integration cards.
- No changes to `FilePreviewModal`, the run endpoint, or API types.
- `pnpm tsc --noEmit` clean.

---

## Out of scope

- Splitting task bodies into separate FILES / SCRIPTS Sections (explicitly rejected — tasks keep their flat list).
- Changes to the integration card file sections.
- Any backend work.
- Anything related to `run` behavior — that's already in place via `FilePreviewModal`'s `runnable` prop, which the `ModuleFilePreview` wrapper passes through regardless of card kind.
