# Plan: Demo Modules Repo

## Goal

Create a standalone git repo (`context-modules-demo`) containing the current linear and supabase modules, ready to be loaded via the git-based module loading system. Each module has `info.md` and `.env.schema` with Infisical annotations — no `.env` files.

## Steps

1. **Create new repo `context-modules-demo`** — initialize with a clean structure

2. **Move linear module** — copy `fixtures/linear/` contents (info.md, .env.schema) into `linear/` in the new repo

3. **Move supabase module** — copy `fixtures/supabase/` contents into `supabase/` in the new repo

4. **Add Infisical annotations to `.env.schema` files** — each module's schema uses `@varlock/infisical-plugin` annotations pointing to the correct Infisical project/path

5. **Set up Infisical secrets** — create entries in Infisical for the demo modules' secrets (LINEAR_API_KEY, SUPABASE_URL, SUPABASE_KEY, etc.)

6. **Add repo-level README** — explain the module format and how to add new modules

7. **Add a root `llms.txt`** — index of available modules for agent navigation

## Repo structure

```
context-modules-demo/
├── README.md
├── llms.txt
├── linear/
│   ├── info.md
│   └── .env.schema
└── supabase/
    ├── info.md
    └── .env.schema
```

## Sample `linear/.env.schema`

```bash
# @initInfisical projectId=<project-id> path=/linear
# @defaultSensitive=true @defaultRequired=infer
# ---
# @setValuesBulk
# @required @sensitive @type=string
LINEAR_API_KEY=
```

## Sample `supabase/.env.schema`

```bash
# @initInfisical projectId=<project-id> path=/supabase
# @defaultSensitive=true @defaultRequired=infer
# ---
# @setValuesBulk
# @required @sensitive @type=string
SUPABASE_URL=
# @required @sensitive @type=string
SUPABASE_KEY=
```

## Verification

1. Clone the demo repo independently, confirm structure is correct
2. Point context-loader's `MODULES_REPO` at the demo repo
3. Start the container, confirm modules load correctly
4. Confirm secrets resolve via Infisical (requires Phase 1 complete)
5. Confirm no `.env` files exist anywhere in the repo

## Dependencies

- Phase 1 (Infisical integration) for secret annotations to work
- Phase 2 (git-based loading) for the repo to be consumed by context-loader
