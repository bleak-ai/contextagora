# Plan: Infisical Integration

## Goal

Replace local `.env` files with Infisical as the single source of secrets. Modules declare their secrets via `@varlock/infisical-plugin` annotations in `.env.schema`, and secrets are resolved at container startup via `varlock run`.

## Steps

1. **Add `@varlock/infisical-plugin` to `.env.schema` files** — each module's schema gets Infisical annotations (`@initInfisical`, `@setValuesBulk`) declaring where its secrets live in Infisical

2. **Provide Infisical credentials as platform-level env vars** — `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_ENVIRONMENT` are passed to the container (not stored in any file)

3. **Update container entrypoint** — the app's `CMD`/entrypoint runs under `varlock run` so all secrets are resolved at startup before the app starts

4. **Update `docker-compose.yml`** — pass Infisical credentials as environment variables to the service

5. **Remove local `.env` files from the workflow** — secrets come exclusively from Infisical; `.env` files are no longer needed or created

6. **Update documentation** — reflect that secrets are now managed via Infisical, not local files

## File changes

```
fixtures/linear/.env.schema   — add Infisical plugin annotations
fixtures/supabase/.env.schema — add Infisical plugin annotations
platform/deploy/docker-compose.yml — add INFISICAL_* env vars
platform/deploy/Dockerfile    — update CMD to use varlock run
fixtures/linear/.env           — remove
fixtures/supabase/.env         — remove
```

## Sample `.env.schema` with Infisical (linear)

```bash
# @initInfisical projectId=<project-id> path=/linear
# @defaultSensitive=true @defaultRequired=infer
# ---
# @setValuesBulk
# @required @sensitive @type=string
LINEAR_API_KEY=
```

## Sample `docker-compose.yml` changes

```yaml
services:
  context-loader:
    environment:
      - INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
      - INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
      - INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-dev}
```

## Sample Dockerfile entrypoint change

```dockerfile
CMD ["varlock", "run", "--", "uvicorn", "app:app", "--host", "0.0.0.0"]
```

## Verification

1. Set up Infisical project with test secrets for linear and supabase
2. Run container with Infisical credentials as env vars
3. Confirm `varlock run` resolves secrets at startup (check logs)
4. Confirm no `.env` files exist in the container
5. Confirm the app can access secrets through varlock at runtime

## Dependencies

- Varlock basic setup (Plan 03) must be done first
- Infisical account and project set up
