# Deploying Project Notcontext

## Quick start

Already have your GitHub PAT, Infisical credentials, and LLM API key? Here's the short version:

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

Open [http://localhost:8080](http://localhost:8080) and you're ready to go. If you need help setting up the prerequisites, read on.

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

Notcontext has a built-in chat feature that needs access to an LLM. You can use any OpenAI-compatible provider:

- **Anthropic** — `ANTHROPIC_AUTH_TOKEN=sk-ant-...` with `ANTHROPIC_BASE_URL=https://api.anthropic.com`
- **OpenAI** — `ANTHROPIC_AUTH_TOKEN=sk-...` with `ANTHROPIC_BASE_URL=https://api.openai.com/v1`
- **Google (Gemini)** — `ANTHROPIC_AUTH_TOKEN=your-gcp-api-key` with `ANTHROPIC_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`
- **Ollama Cloud** — `ANTHROPIC_AUTH_TOKEN=your-ollama-cloud-key` with `ANTHROPIC_BASE_URL=https://ollama.com/v1`

When using a non-Anthropic provider, set the model overrides to match your provider's model names:

```
# Example: OpenAI
ANTHROPIC_DEFAULT_OPUS_MODEL=gpt-4o
ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-4o-mini
ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-4o-mini

# Example: Ollama Cloud
ANTHROPIC_DEFAULT_OPUS_MODEL=llama3.1
ANTHROPIC_DEFAULT_SONNET_MODEL=llama3.1
ANTHROPIC_DEFAULT_HAIKU_MODEL=llama3.1
```

## Prerequisites

- **Docker Engine ≥ 24.0** and **Docker Compose V2** ([install guide](https://docs.docker.com/engine/install/))
- A **GitHub modules repo** — an empty private repo is fine, modules are added through the UI over time
- A **GitHub PAT**, **Infisical account**, and **LLM API key** (see above)

## 1. Install

Run the install script:

```bash
curl -fsSL https://notcontext.com/install.sh | bash
```

This will:
- Create a `notcontext/` directory with `docker-compose.yml` and `.env`
- Pull the latest image

You can specify a custom install directory:

```bash
curl -fsSL https://notcontext.com/install.sh | bash -s -- /opt/notcontext
```

## 2. Configure

Edit the `.env` file with your credentials (see full reference below):

```bash
# ── GitHub Module Source ─────────────────────────────────────────
GH_OWNER=your-github-org
GH_REPO=your-modules-repo
GH_TOKEN=github_pat_...
GH_BRANCH=main

# ── LLM Provider ────────────────────────────────────────────────
# Anthropic (default)
ANTHROPIC_AUTH_TOKEN=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-sonnet-4-20250514
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-20250514
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5-20251001

# OpenAI (uncomment and replace the above)
# ANTHROPIC_AUTH_TOKEN=sk-...
# ANTHROPIC_BASE_URL=https://api.openai.com/v1
# ANTHROPIC_DEFAULT_OPUS_MODEL=gpt-4o
# ANTHROPIC_DEFAULT_SONNET_MODEL=gpt-4o-mini
# ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-4o-mini

# Google (Gemini) (uncomment and replace the above)
# ANTHROPIC_AUTH_TOKEN=your-gcp-api-key
# ANTHROPIC_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# ANTHROPIC_DEFAULT_OPUS_MODEL=gemini-2.5-pro
# ANTHROPIC_DEFAULT_SONNET_MODEL=gemini-2.5-flash
# ANTHROPIC_DEFAULT_HAIKU_MODEL=gemini-2.5-flash

# Ollama Cloud (uncomment and replace the above)
# ANTHROPIC_AUTH_TOKEN=your-ollama-cloud-key
# ANTHROPIC_BASE_URL=https://ollama.com/v1
# ANTHROPIC_DEFAULT_OPUS_MODEL=llama3.1
# ANTHROPIC_DEFAULT_SONNET_MODEL=llama3.1
# ANTHROPIC_DEFAULT_HAIKU_MODEL=llama3.1

# ── Infisical (Secret Management) ───────────────────────────────
INFISICAL_CLIENT_ID=
INFISICAL_CLIENT_SECRET=
INFISICAL_PROJECT_ID=
INFISICAL_ENVIRONMENT=dev
INFISICAL_SITE_URL=https://app.infisical.com
```

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
| `ANTHROPIC_AUTH_TOKEN` | API key for your LLM provider |
| `ANTHROPIC_BASE_URL` | LLM API endpoint |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model ID for the "Opus" tier |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model ID for the "Sonnet" tier |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Model ID for the "Haiku" tier |
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

For production deployments, put Notcontext behind a reverse proxy with TLS. Below are minimal examples for common options.

### Caddy (automatic HTTPS)

```
notcontext.example.com {
    reverse_proxy localhost:8080
}
```

Run with `caddy run --config Caddyfile`. Caddy handles certificate provisioning automatically via Let's Encrypt.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name notcontext.example.com;

    ssl_certificate     /etc/letsencrypt/live/notcontext.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notcontext.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use [certbot](https://certbot.eff.org/) to obtain and renew certificates.

### Notes

- Bind the container to `127.0.0.1` instead of `0.0.0.0` so it's only reachable through the proxy: change `"8080:8080"` to `"127.0.0.1:8080:8080"` in `docker-compose.yml`.
- If you use WebSocket features, ensure your proxy passes `Upgrade` and `Connection` headers.

## Troubleshooting

**Port 8080 already in use**
Change the host port in `docker-compose.yml`: `"9090:8080"` instead of `"8080:8080"`.

**Container exits immediately**
Check the logs:
```bash
docker compose logs context-loader
```

**"Unauthorized" errors from GitHub**
Verify your `GH_TOKEN` has `Contents: read` permission on the target repo. Fine-grained tokens must be scoped to the specific repo.

**Modules not showing up**
Confirm `GH_OWNER` and `GH_REPO` point to the correct repository. Each module should be a folder in the repo root containing at least an `info.md` file.

**Chat not working**
Verify `ANTHROPIC_AUTH_TOKEN` is set and the key is valid.

**Health check failing**
```bash
curl http://localhost:8080/health
```
Should return HTTP 200. If not, check the container logs.

## Notes

- **No persistent volumes needed.** The app is stateless — modules are fetched from GitHub on demand and context is rebuilt each time you load modules. No database or local state to back up.
- **Resource requirements.** The image bundles Python, Node.js, and the Claude Code CLI. Recommend at least **2 GB RAM** and **2 CPU cores**.
