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
4. Leave it empty — no README, no `.gitignore` — modules are added through the UI
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
- A **new, empty GitHub repo** for your modules — create one at [github.com/new](https://github.com/new) before proceeding (modules are added through the UI, not by pushing code)

## 1. Install

```bash
curl -fsSL https://contextagora.com/install.sh | bash
```

This creates a `contextagora/` directory with `docker-compose.yml` and `.env`, and pulls the latest image.

## 2. Configure

Edit the `.env` file with your credentials:

```bash
# ── GitHub Module Source ─────────────────────────────────────────
GH_OWNER=your-github-org          # org or user that owns the modules repo
GH_REPO=your-modules-repo         # repo name
GH_TOKEN=github_pat_...           # fine-grained PAT with Contents read+write

# ── LLM Provider ────────────────────────────────────────────────
LLM_API_KEY=your-api-key          # any OpenAI-compatible provider works
LLM_BASE_URL=https://api.anthropic.com
LLM_MODEL=claude-sonnet-4-20250514

# ── Infisical (only if modules use secrets) ─────────────────────
# INFISICAL_CLIENT_ID=
# INFISICAL_CLIENT_SECRET=
# INFISICAL_PROJECT_ID=
# INFISICAL_ENVIRONMENT=dev
# INFISICAL_SITE_URL=https://app.infisical.com
```

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

1. Create an account at [app.infisical.com](https://app.infisical.com)
2. Create a project and environment for your modules
3. For each module that needs secrets, create a folder named after the module (e.g. `/linear`) and add the key-value pairs there
4. Create a machine identity with Universal Auth (gives you a Client ID and Client Secret)
5. Add the credentials to your `.env`:

```bash
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=dev
INFISICAL_SITE_URL=https://app.infisical.com
```

## Reverse Proxy / HTTPS

For production, put ContextAgora behind a reverse proxy (Caddy, Nginx, etc.) that terminates TLS and forwards to `localhost:8080`. Bind the container to `127.0.0.1` so it's only reachable through the proxy — change `"8080:8080"` to `"127.0.0.1:8080:8080"` in `docker-compose.yml`.

## Troubleshooting

If something isn't working, check the logs: `docker compose logs contextagora`

## Notes

- The app is stateless — no volumes or database needed. Modules are fetched from GitHub on demand.
- Recommend at least **2 GB RAM** and **2 CPU cores**.
