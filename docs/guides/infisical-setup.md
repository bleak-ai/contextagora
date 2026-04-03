# Infisical Setup Guide

Step-by-step instructions to set up Infisical as the secret manager for context-loader modules.

## 1. Create an Infisical Account

1. Go to [app.infisical.com](https://app.infisical.com) and sign up
2. Verify your email

## 2. Create a Project

1. Click **Add New Project**
2. Name it `context-loader`
3. Select the `Development` environment (created by default)

## 3. Create Secret Folders and Add Secrets

In the **Development** environment, create two secret folders and add the corresponding secrets:

### `/linear`

| Secret Name | Value |
|---|---|
| `LINEAR_API_KEY` | Your Linear API key |

### `/supabase`

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |

To create a folder:
1. Go to **Secrets** in the sidebar
2. Click the **+** button and select **Add Folder**
3. Name it (e.g., `linear`)
4. Navigate into the folder and add the secrets

## 4. Create a Machine Identity and Get Credentials

Machine identities allow programmatic access (no human login needed). Universal Auth is enabled by default.

1. Go to **Organization Settings** > **Access Control** > **Identities**
2. Click **Create Identity**
3. Name it `context-loader-dev`, set role to **Member**
4. After creation you'll land on the identity page — the **Client ID** is displayed here. Copy it — this is your `INFISICAL_CLIENT_ID`
5. On the same page, click **Create Client Secret**
   - Optionally add a description (e.g., "local dev")
   - Leave TTL at `0` (never expires) for dev
   - Click **Create** and immediately copy the generated secret — this is your `INFISICAL_CLIENT_SECRET` (you won't see it again)

## 5. Grant Project Access

1. Go to your `context-loader` project
2. Go to **Project Settings** > **Access Control** > **Machine Identities**
3. Click **Add Identity**
4. Select `context-loader-dev`
5. Set role to **Member** (read access to secrets)

## 6. Get the Project ID

1. Go to **Project Settings** > **General**
2. Copy the **Project ID** (a UUID like `a1b2c3d4-...`)

## 7. Configure `platform/deploy/.env`

Create the file `platform/deploy/.env` with your credentials:

```bash
# Platform secrets
ANTHROPIC_AUTH_TOKEN=your-anthropic-token
ANTHROPIC_BASE_URL=your-anthropic-base-url

# Infisical bootstrap credentials
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
# Use https://eu.infisical.com for EU accounts (defaults to https://app.infisical.com)
INFISICAL_SITE_URL=https://app.infisical.com
```

This file is gitignored (`*.env` in `.gitignore`).

## 8. Run

```bash
cd platform/deploy
docker compose up --build
```

Docker Compose will automatically read `.env` and pass the variables to the container. When modules are loaded via the UI, varlock will use the Infisical credentials to fetch module secrets at runtime.

## How It Works

Modules declare only *what* secrets they need (e.g., `LINEAR_API_KEY=`). The platform injects *how* to fetch them at load time.

```
platform/deploy/.env
  ├── ANTHROPIC_* → passed directly to the app as env vars
  └── INFISICAL_* → used by server.py to configure varlock
                     │
                     ▼
        User loads a module via UI
                     │
        server.py copies module to context/ and augments its .env.schema:
          - prepends @initInfisical(...) with platform credentials
          - rewrites LINEAR_API_KEY= → LINEAR_API_KEY=infisical()
                     │
        server.py calls: varlock load --path context/linear/
                     │
        varlock reads the augmented schema, connects to Infisical,
        fetches LINEAR_API_KEY from /linear path
                     │
        Secret is available in the module's environment
```

Module `.env.schema` files stay clean — no Infisical config. The augmentation is done by `server.py` at load time, so modules are portable across different secret backends.

## Troubleshooting

- **"INFISICAL_CLIENT_ID not set"** — Make sure `platform/deploy/.env` exists and has the credentials
- **"Failed to fetch secret"** — Check that the machine identity has access to the project and the secret path exists
- **"Secret not found"** — Verify the secret name in Infisical matches exactly (case-sensitive)
