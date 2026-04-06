# Deploying Context Loader

## Prerequisites

- **Docker Engine ≥ 24.0** and **Docker Compose V2** ([install guide](https://docs.docker.com/engine/install/))
- A **GitHub Personal Access Token** (fine-grained) with `Contents: read` permission on the repo that holds your context modules. Add `Contents: write` if you want to create/edit modules from the UI.
- An **Anthropic API key** for the chat feature

## Quick Start

1. Download the two files you need:

   ```bash
   curl -O https://raw.githubusercontent.com/bleak-ai/context-loader/master/docker-compose.yml
   curl -O https://raw.githubusercontent.com/bleak-ai/context-loader/master/.env.example
   ```

   Or clone the repo: `git clone https://github.com/bleak-ai/context-loader.git && cd context-loader`

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and fill in the required values:

   ```
   GH_OWNER=your-github-org
   GH_REPO=your-modules-repo
   GH_TOKEN=github_pat_...
   ANTHROPIC_AUTH_TOKEN=sk-ant-...
   ```

4. Start the service:

   ```bash
   docker compose up -d
   ```

5. Open [http://localhost:8080](http://localhost:8080)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_OWNER` | Yes | GitHub org or user that owns the modules repo |
| `GH_REPO` | Yes | Repository name containing your context modules |
| `GH_TOKEN` | Yes | Fine-grained PAT with Contents read (+ write for editing modules) |
| `ANTHROPIC_AUTH_TOKEN` | Yes | Anthropic API key for the chat feature |
| `ANTHROPIC_BASE_URL` | No | Custom API endpoint (for proxies) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | No | Override the default Opus model ID |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | No | Override the default Sonnet model ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | No | Override the default Haiku model ID |
| `INFISICAL_CLIENT_ID` | No | Infisical machine identity client ID |
| `INFISICAL_CLIENT_SECRET` | No | Infisical machine identity client secret |
| `INFISICAL_PROJECT_ID` | No | Infisical project to read secrets from |
| `INFISICAL_ENVIRONMENT` | No | Infisical environment slug (default: `dev`) |
| `INFISICAL_SITE_URL` | No | Infisical instance URL (default: `https://app.infisical.com`) |

The Infisical variables are only needed if your modules use secrets. See [Infisical setup guide](infisical-setup.md) for details.

## Updating

The image is published to `ghcr.io/bleak-ai/context-loader:latest` on every push to master.

```bash
docker compose pull
docker compose up -d
```

## HTTPS with Caddy

For production deployments, put a reverse proxy in front of the app. [Caddy](https://caddyserver.com/) handles HTTPS automatically via Let's Encrypt.

1. Create a `Caddyfile` next to your `docker-compose.yml`:

   ```
   your-domain.com {
       reverse_proxy context-loader:8080
   }
   ```

2. Create a `docker-compose.override.yml`:

   ```yaml
   services:
     caddy:
       image: caddy:2
       restart: unless-stopped
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddy_data:/data
         - caddy_config:/config
       depends_on:
         - context-loader

   volumes:
     caddy_data:
     caddy_config:
   ```

3. Comment out the `ports` mapping for `context-loader` in `docker-compose.yml` so only Caddy is exposed:

   ```yaml
   services:
     context-loader:
       # ports:
       #   - "8080:8080"
   ```

4. Start both services:

   ```bash
   docker compose up -d
   ```

   Caddy will automatically obtain a TLS certificate for your domain.

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

**Cannot pull image**
If the GHCR package is private, authenticate first:
```bash
docker login ghcr.io
```
Use a GitHub PAT with `read:packages` scope as the password.

## Notes

- **No persistent volumes needed.** The app is stateless — modules are fetched from GitHub on demand and context is rebuilt each time you load modules. No database or local state to back up.
- **Resource requirements.** The image bundles Python, Node.js, and the Claude Code CLI. Recommend at least **2 GB RAM** and **2 CPU cores**.
