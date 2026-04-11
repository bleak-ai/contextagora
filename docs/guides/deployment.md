# Deploying ContextAgora

## Quick start

If you already have your credentials ready:

```bash
# 1. Install
curl -fsSL https://contextagora.com/install.sh | bash

# 2. Configure
cd contextagora && nano .env   # fill in your credentials

# 3. Start
docker compose up -d

# 4. Verify
curl http://localhost:8080/health   # should return 200
```

Open [http://localhost:8080](http://localhost:8080) and you're ready to go.

---

## Before you start

### 1. Create a GitHub repository for your modules

ContextAgora stores all your modules in a GitHub repository that you own. You need to create this repo before configuring ContextAgora.

1. Go to [github.com/new](https://github.com/new)
2. Give it any name (e.g. `my-contextagora-modules`)
3. Set visibility to **Private** (recommended) or Public
4. Check **Add a README file** — this creates the `main` branch (required)
5. Note the **owner** (your GitHub username or org) and **repo name** — you'll need both for `.env`

### 2. Create a GitHub Personal Access Token

ContextAgora needs a fine-grained PAT to access the modules repo.

1. Go to [GitHub > Settings > Developer settings > Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Set a descriptive name (e.g. `contextagora-modules`)
3. Under **Repository access**, select **Only select repositories** and pick the repo you just created
4. Under **Permissions > Repository permissions**, set:
   - `Contents`: **Read and write** (read to fetch modules, write to create/edit from the UI)
5. Click **Generate token** and save the value — this is your `GH_TOKEN`

### LLM API key

ContextAgora has a built-in chat feature that needs access to an LLM. Any OpenAI-compatible provider works (Anthropic, OpenAI, Google Gemini, Ollama, etc.). Set `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` in your `.env`.

## Prerequisites

- [Docker Engine ≥ 24.0](https://docs.docker.com/engine/install/) with Docker Compose V2
- A **GitHub repo for your modules** — create one at [github.com/new](https://github.com/new) with a README (modules are added through the UI)

## 1. Install

```bash
curl -fsSL https://contextagora.com/install.sh | bash
```

This creates a `contextagora/` directory with `docker-compose.yml` and `.env`, and pulls the latest image.

## 2. Configure

Edit the `.env` file with your credentials:

```bash
# ── GitHub Module Source ─────────────────────────────────────────
GH_OWNER=your-github-org
GH_REPO=your-modules-repo
GH_TOKEN=github_pat_...

# ── LLM Provider ────────────────────────────────────────────────
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://...
LLM_MODEL=...

# ── Infisical (only if modules use secrets) ─────────────────────
# INFISICAL_CLIENT_ID=
# INFISICAL_CLIENT_SECRET=
# INFISICAL_PROJECT_ID=
# INFISICAL_ENVIRONMENT=dev
# INFISICAL_SITE_URL=https://app.infisical.com
```

Provider reference:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` example |
|----------|----------------|---------------------|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-pro` |
| Ollama Cloud | `https://ollama.com/v1` | `glm-5.1` |

## 3. Start

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

## Updating

```bash
docker compose pull
docker compose up -d
```

## Setting up secrets (optional)

If your modules need secrets (API keys, tokens, etc.), ContextAgora resolves them at runtime via Varlock + [Infisical](https://infisical.com). You can set this up later — modules without secrets work fine without it.

### Step 1 — Create an Infisical account and project

1. Sign up at [app.infisical.com](https://app.infisical.com)
2. Click **Create a new project** and give it a name (e.g. `contextagora`)
3. After the project is created, open **Project Settings** (gear icon in the left sidebar)
4. Copy the **Project ID** shown at the top of the page — this is your `INFISICAL_PROJECT_ID`

### Step 2 — Choose (or create) an environment

Infisical creates `development`, `staging`, and `production` environments by default. Pick one to use — `development` is fine to start.

The short slug for each environment is what goes in `INFISICAL_ENVIRONMENT`:

| Display name | Slug to use |
|---|---|
| Development | `dev` |
| Staging | `staging` |
| Production | `prod` |

> You can create a custom environment under **Project Settings > Environments** and use its slug.

### Step 3 — Add secrets for each module

Secrets are organized by folder. Each module must have its own folder named exactly after the module slug.

1. In your project, go to **Secrets** and select the environment you chose
2. Click **Add Folder** and name it after the module (e.g. `linear`, `openweather`)
3. Open the folder and click **Add Secret** to add each key-value pair the module needs

Repeat for every module that requires secrets.

### Step 4 — Create a Machine Identity (get Client ID + Client Secret)

1. In the left sidebar, click **Access Control > Machine Identities**
2. Click **Create identity**, give it a name (e.g. `contextagora-runtime`), and assign the **Member** role
3. After creating the identity, click on it and open the **Authentication** tab
4. Click **Add Auth Method**, select **Universal Auth**, and save with the defaults
5. Under the Universal Auth section, click **Create Client Secret**
6. Copy both values that appear:
   - **Client ID** → `INFISICAL_CLIENT_ID`
   - **Client Secret** → `INFISICAL_CLIENT_SECRET` *(shown only once — save it immediately)*

### Step 5 — Grant the identity access to your project

1. In your project, go to **Access Control > Members**
2. Switch to the **Machine Identities** tab and click **Add identity**
3. Select the identity you just created and assign the **Member** role
4. Click **Add**

### Step 6 — Add the credentials to your `.env`

```bash
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
INFISICAL_SITE_URL=https://app.infisical.com
```

> `INFISICAL_SITE_URL` only needs to change if you are self-hosting Infisical.

## Reverse Proxy / HTTPS

For production, put ContextAgora behind a reverse proxy (Caddy, Nginx, etc.) that terminates TLS and forwards to `localhost:8080`. Bind the container to `127.0.0.1` so it's only reachable through the proxy — change `"8080:8080"` to `"127.0.0.1:8080:8080"` in `docker-compose.yml`.

## Troubleshooting

If something isn't working, check the logs: `docker compose logs contextagora`

## Notes

- The app is stateless — no volumes or database needed. Modules are fetched from GitHub on demand.
- Recommend at least **2 GB RAM** and **2 CPU cores**.
