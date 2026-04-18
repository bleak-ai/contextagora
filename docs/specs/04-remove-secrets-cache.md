# Spec 04 — Remove `_secrets_cache` module-level global

## Goal

Drop the module-level mutable cache in `routes/workspace.py` and resolve secrets on demand. React-query on the frontend already provides staleness control; a backend cache is redundant and hostile to tests / multi-worker deploys.

## Answers driving this spec

- **Remove the cache** (all four questions answered "remove cache").

## Current state

`platform/src/routes/workspace.py`:

```python
_secrets_cache: dict[str, dict[str, str | None]] = {}
```

- `GET /api/workspace` reads from `_secrets_cache` (via `_secrets_cache.get(name, {})`).
- `POST /api/workspace/secrets` rewrites `_secrets_cache` with the full result of `get_secrets_status(...)`, then prunes the schema.
- No other reader/writer.

## Target behavior

- `POST /api/workspace/secrets` resolves secrets via `get_secrets_status(...)`, prunes the schema, and **returns** the payload to the client. No in-memory retention on the server.
- `GET /api/workspace` no longer returns secret preview data (frontend receives secrets only from the `/secrets` endpoint response).
- Frontend already calls `refreshSecrets` explicitly after `loadModules` (see `ContextPanel.tsx:122-131`); it should store the result in its own react-query cache keyed separately from `/api/workspace`.

## Implementation steps

### Backend

1. In `routes/workspace.py`:
   - Delete the module-level `_secrets_cache`.
   - In `api_workspace`, remove the `secrets` field from the per-module dict (or return `{}` explicitly).
   - Leave `api_workspace_secrets` logic intact but remove the `global _secrets_cache` + assignment. Still call `prune_schema_for_resolved(secrets_result, settings.CONTEXT_DIR)`.
2. Response shape for `POST /api/workspace/secrets` stays `{ "secrets": {...} }`.

### Frontend

3. In `platform/frontend/src/api/workspace.ts`:
   - `fetchWorkspace()` response type: remove `secrets` from `LoadedModule` **OR** keep the field typed as `Record<string, string | null>` (empty object always).
4. In `ContextPanel.tsx` / `ModuleCard.tsx`:
   - Currently read `loaded.secrets` — pull from the refresh-secrets react-query cache instead.
   - Wire a new react-query:
     ```ts
     useQuery({
       queryKey: ["workspace-secrets"],
       queryFn: refreshSecrets,   // already POSTs and returns payload
       staleTime: 30_000,
       enabled: loaded.length > 0,
     });
     ```
   - Merge `secrets` into each `LoadedModule` at render time.
5. On load/install mutations, invalidate `["workspace-secrets"]` alongside `["workspace"]`.

### Alternative (cheaper) frontend path

Keep the current shape (`loaded.secrets` populated by backend) but have `api_workspace` call `get_secrets_status(...)` fresh on each request. Simpler code, one extra varlock invocation per sidebar open. Pick this if the extra varlock call is cheap in practice — measure with `time curl localhost:9090/api/workspace` after the change.

**Recommended:** start with the alternative (one-line server change), escalate to the react-query split only if latency bites.

## Acceptance

- `grep -n "_secrets_cache" platform/src` returns no matches.
- Sidebar still shows secret availability after loading a module.
- No `global` statements in `routes/workspace.py`.

## Out of scope

- Redis / cross-process caching (deferred until multi-worker is actually on the roadmap).
- Changing the Infisical resolution logic itself.
