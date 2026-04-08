# Sidebar context visualization

**Status:** Spec
**Date:** 2026-04-08
**Affected component:** `platform/frontend/src/components/ContextPanel.tsx`

## Goal

Make it visually obvious, from a single glance at the sidebar, what each loaded module brings into the chat. The user should immediately see — without leaving the sidebar or opening a separate panel — which **files**, **secrets**, and **packages** each module contributes, and whether anything is broken.

## Motivation

The current sidebar (`ContextPanel.tsx`) shows two flat lists: a checklist of available modules and a per-module list of secrets. It does not show:

- which **files** each loaded module contributes
- which **packages** each module installs into the shared `.venv`, or whether they're actually installed
- a per-module rollup that lets the user expand a single module to see everything it brought

The user has spent significant brainstorming time exploring elaborate "wiring diagram" visualizations and rejected them as too noisy. The agreed direction is **expandable per-module cards inside the existing sidebar shell** — a small, additive change that surfaces the missing information without restructuring the app.

## Scope

### In scope

- Replace the current `MODULES` + `SECRETS` sections in `ContextPanel.tsx` with a single `MODULES` section where each loaded module is an expandable card.
- Each expanded card shows three sections: **📄 FILES**, **🔑 SECRETS**, **📦 PACKAGES**, with item counts in the section header.
- Idle (not-loaded) modules render as collapsed monochrome rows that toggle their selected state on click (preserving today's "select then click Load" flow).
- A new backend endpoint or extension that returns, per loaded module, the file list, the secret previews/missing-state, and the package list with install status.
- Replace the multi-color identity dots from the brainstorming mockups with a single accent dot (blue when wired, amber when partial).

### Out of scope

- Wiring diagrams, beams, or any animated connection visualizations.
- Per-module color identity across the app.
- Drag-and-drop module reordering or load-on-drop.
- Package conflict detection or per-module venv isolation (the shared-venv warning stays surfaced via amber dot only when a real install failure happens, not as a permanent banner).
- Sessions and Decision Tree sub-panels (they keep their current shape).

## User-visible design

Each loaded module is a small card with a 1px border. Header is always visible:

```
[●] linear                                              ▾
```

- `●` is a 7px dot. **Blue (`#6b8afd`)** when the module is fully wired. **Amber (`#fbbf24`)** when at least one secret is missing or a package failed to install. The card border tints amber to match.
- Module name in default text color.
- `▾` / `▸` chevron for expand/collapse state.

When expanded, the body reveals three sections separated by 8px:

```
📄 FILES                       3
   info.md
   docs/api.md
   docs/webhooks.md

🔑 SECRETS                     2
   LINEAR_API_KEY        lin▒▒▒▒▒
   LINEAR_TEAM_ID        tm▒▒▒▒▒

📦 PACKAGES                    1
   linear-sdk            2.4.0
```

For a partial module (e.g. `stripe` with a missing secret):

```
🔑 SECRETS                   1 / 2
   STRIPE_SECRET_KEY     sk▒▒▒▒▒
   STRIPE_WEBHOOK_SECRET   [missing]
```

- **No checkmarks for OK items.** Items just exist. Their absence of a tag means they're fine.
- **Only `missing` is red.** It's the only state that requires the user to act (set the secret in Infisical).
- Section header counts use `1 / 2` form when partial, otherwise just `2`. The fraction turns amber when partial.
- File / secret / package names are in default body color (`#d4d6db`); previews and versions are in `#9ba1ac`; section labels and counts in `#6b7280`. The data is the loudest thing on the card.
- Secret previews show only the start: the existing `load_and_mask_module_secrets` already returns `2-char-prefix + 5×▒` (e.g. `lin▒▒▒▒▒`). This format is kept as-is.

Idle modules render as a single collapsed row in the same monochrome card style, at ~55% opacity, with no expansion body. Clicking toggles selection (same as today). The existing "Load Selected" button at the bottom is unchanged.

The Sessions panel and Decision Tree panel are not touched.

## Architecture

### Data model

The frontend currently fetches workspace state via `GET /api/workspace`, which returns:

```ts
{ modules: string[], secrets: Record<string, Record<string, string | null>> }
```

This is insufficient — it has neither file lists nor packages. We extend the workspace endpoint to return rich per-module data:

```ts
type LoadedModule = {
  name: string;
  files: string[];                    // relative paths inside context/<name>/
  secrets: Record<string, string | null>;  // null = missing, otherwise masked preview
  packages: { name: string; version: string | null; installed: boolean }[];
};

type WorkspaceResponse = {
  modules: LoadedModule[];            // was string[]
};
```

The shape of `secrets` per module is unchanged, just hoisted inside the per-module object instead of a parallel dict. The top-level `secrets` field is removed.

### Backend changes

**File: `platform/src/routes/workspace.py`**

- `GET /api/workspace` is modified. For each loaded module under `CONTEXT_DIR`, it now assembles and returns a `LoadedModule` shape:
  - **files:** call `git_repo.list_module_files(name, MANAGED_FILES)` (already exists, returns `[{name, path}]`) and project to `path[]`. Note: this lists files in the local clone, not the workspace copy. Since the workspace copy is a snapshot at load time, we should list from `CONTEXT_DIR / name` directly using a small helper. New helper goes in `services/workspace_inspect.py`.
  - **secrets:** read from the existing `_secrets_cache` (already keyed by module name).
  - **packages:** new helper. Reads `CONTEXT_DIR / name / requirements.txt` to get the declared package names; for each, runs `importlib.metadata.version(name)` (or shells out to `uv pip show <name> --python <sys.executable>`) once at request time to get the installed version. Returns `{name, version, installed}`. If `requirements.txt` doesn't exist, returns `[]`.

**File: `platform/src/services/workspace_inspect.py` (new)**

Two helpers:
- `list_workspace_files(module_dir: Path, managed_files: set[str]) -> list[str]` — same logic as `git_repo.list_module_files` but operating on the workspace copy. Returns relative paths only (e.g. `info.md`, `docs/api.md`).
- `inspect_module_packages(module_dir: Path) -> list[dict]` — parses `requirements.txt`, looks up the installed version of each package via `importlib.metadata`, returns a list of `{name, version, installed}`. Catches `PackageNotFoundError` to mark `installed: False, version: None`.

The package inspection runs on every `GET /api/workspace` call. This is cheap (a few `importlib.metadata` lookups) and removes the need for any caching layer. If profiling shows it's slow with many modules, we add a simple per-request memo.

`POST /api/workspace/load` is unchanged in shape: it still returns `{modules: string[]}` for compatibility, but the frontend will refetch `GET /api/workspace` after a successful load (it already invalidates the workspace query).

### Frontend changes

**File: `platform/frontend/src/api/workspace.ts`**

- Update the `WorkspaceResponse` type to match the new shape.
- The `fetchWorkspace` function is unchanged in implementation; only its return type changes.
- The `refreshSecrets` mutation continues to work — it triggers a workspace refetch which now also refreshes packages and files.

**File: `platform/frontend/src/components/ContextPanel.tsx`**

This file currently mixes sidebar shell, sessions panel, modules list, secrets list, and the load button. It's grown to ~340 lines and needs to be broken up — not as a refactor for refactor's sake, but because the new "expandable card per module" component is the natural unit and should live in its own file.

The split:

- **`ContextPanel.tsx`** stays as the layout shell: header, collapse button, sessions section, modules section wrapper, decision tree section. Gets shorter, ~150 lines.
- **`ModuleList.tsx` (new)** — receives `loaded: LoadedModule[]`, `available: string[]`, `selected: Set<string>`, plus the toggle and load handlers. Renders the loaded cards (using `ModuleCard`), the idle module rows, and the Load Selected button. ~80 lines.
- **`ModuleCard.tsx` (new)** — receives one `LoadedModule` plus an `expanded` boolean and an `onToggle` callback. Renders the header (dot + name + chevron) and, when expanded, the three sections (files / secrets / packages). ~80 lines. The expanded state lives in `ModuleList` as a `Set<string>` of expanded module names.
- **`workspace.css`** or Tailwind classes inline — keep using Tailwind to match the rest of the codebase, no new CSS file.

The Secrets section (currently a separate sub-panel below the Modules list) is **deleted** — its data now lives inside each module card. The "Check Infisical Secrets" button moves to the header of the Modules section as a small `↻` icon button. The mutation it fires (`refreshSecrets`) is unchanged.

### Edge cases

- **Module with no `.env.schema`** — the SECRETS section header still renders with count `0`, but the section body is empty. Or we can hide the section entirely if count is 0; pick the latter to reduce noise.
- **Module with no `requirements.txt`** — same: hide the PACKAGES section if there are zero packages.
- **Module with no extra files (only `info.md`)** — show the FILES section with just `info.md`.
- **Package declared in `requirements.txt` but not installed** — `installed: false, version: null`. Render as `<name>  not installed` in red, similar to the `missing` secret tag. This is a real failure mode (uv pip install errored or was skipped) and the user needs to know.
- **Module just loaded but secrets cache is stale** — the load endpoint already triggers `_secrets_cache` updates indirectly (`POST /api/workspace/secrets` is called by the existing UI after load). The new data shape doesn't change this flow; the workspace query refetches after each load and the cache is read at that moment.
- **Many files/packages** — sections scroll naturally inside the existing sidebar overflow. No virtualization needed for realistic module sizes (<50 items per section).

### Status mapping

The single accent dot in the card header is computed by the frontend from the `LoadedModule` data:

```ts
function status(m: LoadedModule): "ok" | "warn" {
  const missingSecret = Object.values(m.secrets).some(v => v === null);
  const failedPackage = m.packages.some(p => !p.installed);
  return (missingSecret || failedPackage) ? "warn" : "ok";
}
```

There is no third "error" tier — `warn` covers everything actionable.

## Testing

- **Backend unit tests** in `platform/tests/test_workspace_inspect.py`:
  - `list_workspace_files` returns expected paths for a module with `info.md` + `docs/*.md`.
  - `inspect_module_packages` correctly reports installed/uninstalled packages given a fixture `requirements.txt`.
  - Empty `requirements.txt` returns `[]`.
- **Backend integration test** for `GET /api/workspace`: loads a synthetic module fixture, asserts the response shape matches `LoadedModule` for each loaded entry.
- **Frontend**: no existing test setup for components. Skip — manual verification in the running app is sufficient for a UI-only change at this scale.

## Migration

- The `WorkspaceResponse` shape change is breaking for the frontend, but the frontend is the only consumer. Both ends ship together; no API versioning required.
- The old top-level `secrets` field on the workspace response is removed in the same PR. No code outside `ContextPanel.tsx` touches it.

## Open questions

None blocking. Two minor decisions deferred to implementation:

1. Whether `inspect_module_packages` uses `importlib.metadata` (in-process, faster, simpler) or shells out to `uv pip show` (matches the install path, but slower). Default to `importlib.metadata`; fall back to `uv pip show` only if it proves unreliable for editable installs.
2. Whether to hide empty sections (count = 0) or render them as empty. Default to hiding them — the design goal is "the data is the loudest thing".
