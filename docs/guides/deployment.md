# Deploying Project Notcontext

## Quick start

If you already have your credentials ready:

```bash
# 1. Install
curl -fsSL https://notcontext.com/install.sh | bash

# 2. Configure
cd notcontext && nano .env   # fill in your credentials

# 3. Start
docker compose up -d

# 4. Verify
curl http://localhost:8080/health   # should return 200
```

Open [http://localhost:8080](http://localhost:8080) and you're ready to go.

---

## Before you start

### GitHub Personal Access Token

Notcontext needs a fine-grained PAT to access the modules repo.

1. Go to [GitHub > Settings > Developer settings > Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Set a descriptive name (e.g. `notcontext-modules`)
3. Under **Repository access**, select **Only select repositories** and pick your modules repo
4. Under **Permissions > Repository permissions**, set:
   - `Contents`: **Read and write** (read to fetch modules, write to create/edit from the UI)
5. Click **Generate token** and save the value — this is your `GH_TOKEN`

### Infisical

Notcontext uses [Infisical](https://infisical.com) as a secrets vault. Module secrets are never stored on disk — they are resolved at runtime via Varlock + Infisical.

1. Create an account at [app.infisical.com](https://app.infisical.com) (or your self-hosted instance)
2. Create a **project** for your modules' secrets
3. Create an **environment** within that project (e.g. `dev`, `production`)
4. For each module that needs secrets, create a **folder** named after the module (e.g. `/linear`, `/supabase`) and add the secret key-value pairs there
5. Create a **machine identity**:
   - Go to **Organization Settings > Machine Identities**
   - Create a new identity and attach it to your project with read access
   - Under **Authentication**, create a **Universal Auth** client — this gives you a `Client ID` and `Client Secret`

You'll need these values for your `.env`:

| Infisical value | `.env` variable |
|-----------------|-----------------|
| Client ID | `INFISICAL_CLIENT_ID` |
| Client Secret | `INFISICAL_CLIENT_SECRET` |
| Project ID (from project settings) | `INFISICAL_PROJECT_ID` |
| Environment slug | `INFISICAL_ENVIRONMENT` |
| Instance URL | `INFISICAL_SITE_URL` |

### LLM API key

Notcontext has a built-in chat feature that needs access to an LLM. Any OpenAI-compatible provider works (Anthropic, OpenAI, Google Gemini, Ollama, etc.). Set `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` in your `.env`.

## Prerequisites

- [Docker Engine ≥ 24.0](https://docs.docker.com/engine/install/) with Docker Compose V2
- A GitHub repo for your modules (can be empty — modules are added through the UI)

## 1. Install

```bash
curl -fsSL https://notcontext.com/install.sh | bash
```

This creates a `notcontext/` directory with `docker-compose.yml` and `.env`, and pulls the latest image.

## 2. Configure

Edit the `.env` file with your credentials:

```bash
# ── GitHub Module Source ─────────────────────────────────────────
GH_OWNER=your-github-org
GH_REPO=your-modules-repo
GH_TOKEN=github_pat_...
GH_BRANCH=main

# ── LLM Provider ────────────────────────────────────────────────
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.anthropic.com
LLM_MODEL=claude-sonnet-4-20250514

# ── Infisical (Secret Management) ───────────────────────────────
INFISICAL_CLIENT_ID=
INFISICAL_CLIENT_SECRET=
INFISICAL_PROJECT_ID=
INFISICAL_ENVIRONMENT=dev
INFISICAL_SITE_URL=https://app.infisical.com
```

Any OpenAI-compatible provider works (OpenAI, Google Gemini, Ollama, etc.) — just set `LLM_BASE_URL` to your provider's endpoint and `LLM_MODEL` to match.

## 3. Start

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GH_OWNER` | GitHub org or user that owns the modules repo |
| `GH_REPO` | Repository name containing your context modules |
| `GH_TOKEN` | Fine-grained PAT with Contents read + write |
| `GH_BRANCH` | Branch of the module repo to track |
| `LLM_API_KEY` | API key for your LLM provider |
| `LLM_BASE_URL` | LLM API endpoint — any OpenAI-compatible URL works |
| `LLM_MODEL` | Model ID to use for chat |
| `INFISICAL_CLIENT_ID` | Infisical machine identity client ID |
| `INFISICAL_CLIENT_SECRET` | Infisical machine identity client secret |
| `INFISICAL_PROJECT_ID` | Infisical project to read secrets from |
| `INFISICAL_ENVIRONMENT` | Infisical environment slug |
| `INFISICAL_SITE_URL` | Infisical instance URL |

## Updating

```bash
docker compose pull
docker compose up -d
```

## Reverse Proxy / HTTPS

For production, put Notcontext behind a reverse proxy (Caddy, Nginx, etc.) that terminates TLS and forwards to `localhost:8080`. Bind the container to `127.0.0.1` so it's only reachable through the proxy — change `"8080:8080"` to `"127.0.0.1:8080:8080"` in `docker-compose.yml`.

## Troubleshooting

If something isn't working, check the logs: `docker compose logs context-loader`

## Notes

- The app is stateless — no volumes or database needed. Modules are fetched from GitHub on demand.
- Recommend at least **2 GB RAM** and **2 CPU cores**.
