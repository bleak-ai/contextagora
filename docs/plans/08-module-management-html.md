# Plan: Module Management UI — HTML + Jinja2 + htmx

## Goal

Add the ability to create, edit, and delete context modules directly from the web UI, using the existing HTML/Jinja2 stack enhanced with htmx for interactivity.

## Why htmx

htmx adds SPA-like behavior (partial page updates, inline editing, live feedback) with a single 14kb script tag. No build step, no node_modules, no API rewrite. The server stays in control — FastAPI returns HTML fragments and htmx swaps them into the page.

## What changes

### New UI sections (added to index.html or as separate templates)

1. **Module Registry Browser** — list all modules in the source repo with actions: view, edit, delete
2. **Create Module Form** — name + initial `info.md` content, optionally `.env.schema`
3. **Edit Module** — inline editor for `info.md` and other files within a module
4. **Delete Module** — confirmation dialog, removes from source repo via GitHub API

### New API endpoints (server.py)

```
GET  /modules                    — list all modules (HTML fragment for htmx)
GET  /modules/{name}             — view module detail (files, info.md preview)
GET  /modules/{name}/edit        — render edit form for a module
POST /modules/{name}/edit        — save changes to module files via GitHub API
POST /modules/create             — create a new module (mkdir + info.md) via GitHub API
POST /modules/{name}/delete      — delete a module from the source repo
GET  /modules/{name}/files/{path} — view/edit a specific file
```

### GitHub API integration (write operations)

Current code only reads from GitHub. New write operations needed:

- **Create file**: `PUT /repos/{owner}/{repo}/contents/{path}` with base64-encoded content
- **Update file**: same endpoint, include the file's current `sha`
- **Delete file**: `DELETE /repos/{owner}/{repo}/contents/{path}` with `sha`
- **Delete directory**: iterate contents and delete each file (GitHub API has no recursive delete)

These go into a new `_gh_write()` helper alongside the existing `_gh_api()`.

### File structure

```
platform/src/
  server.py                      — add new routes + GitHub write helpers
  templates/
    index.html                   — add htmx script, module management section
    partials/
      module_list.html           — htmx fragment: module cards with actions
      module_form.html           — htmx fragment: create/edit form
      module_detail.html         — htmx fragment: file listing + preview
      confirm_delete.html        — htmx fragment: delete confirmation
```

### UI flow

```
[index.html]
  ├── Module Picker (existing) — select & load modules
  └── Module Registry (new)
       ├── [Create New Module] button
       │    └── form: name, info.md textarea → POST /modules/create
       ├── Module card (per module)
       │    ├── Preview (info.md first 3 lines)
       │    ├── [Edit] → GET /modules/{name}/edit → inline form
       │    ├── [Delete] → confirm → POST /modules/{name}/delete
       │    └── File count badge
       └── Search/filter input (client-side, no htmx needed)
```

### htmx patterns used

```html
<!-- Load module list into a div -->
<div hx-get="/modules" hx-trigger="load" hx-swap="innerHTML">
  Loading modules...
</div>

<!-- Inline edit: clicking Edit swaps the card with a form -->
<button hx-get="/modules/linear/edit" hx-target="#module-linear" hx-swap="outerHTML">
  Edit
</button>

<!-- Save: form submits, response replaces the form with updated card -->
<form hx-post="/modules/linear/edit" hx-target="#module-linear" hx-swap="outerHTML">
  <textarea name="content">...</textarea>
  <button type="submit">Save</button>
</form>

<!-- Delete with confirmation -->
<button hx-post="/modules/linear/delete" hx-confirm="Delete module 'linear'?" hx-target="#module-linear" hx-swap="outerHTML">
  Delete
</button>
```

## Token requirements

The `GH_TOKEN` needs upgraded permissions:
- Current: `Contents: read-only`
- Required: `Contents: read and write`

## Implementation order

1. Add htmx `<script>` tag to index.html
2. Add GitHub write helpers (`_gh_create_file`, `_gh_update_file`, `_gh_delete_file`)
3. Add `GET /modules` route returning HTML fragment with module cards
4. Add module registry section to index.html with htmx loading
5. Add create module form + `POST /modules/create` route
6. Add edit module form + `POST /modules/{name}/edit` route
7. Add delete module + `POST /modules/{name}/delete` route
8. Add search/filter (pure JS, no server)
9. Cache invalidation — bust `_modules_cache` after any write operation

## Estimated effort

- ~200-300 lines of new Python (routes + GitHub write helpers)
- ~150-200 lines of new HTML templates (partials)
- 1 new dependency: none (htmx loaded from CDN)

## Risks

- **GitHub API rate limits**: write operations count toward the 5000 req/hr limit. Not an issue for manual UI usage but worth noting.
- **Conflict handling**: if two users edit the same module, the second save will fail (GitHub requires current `sha`). htmx can show the error inline.
- **Large files**: GitHub Contents API has a 100MB limit and base64 encoding inflates payloads. Not a concern for markdown/schema files.

## Out of scope

- File upload (binary assets)
- Module versioning / history (use GitHub's native history)
- Multi-file creation in one step (create module makes `info.md` only, add more files via edit)
- Auth/permissions on the UI itself
