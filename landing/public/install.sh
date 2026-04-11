#!/usr/bin/env bash
set -euo pipefail

# ── Project Semelweis Installer ─────────────────────────────────
# This script sets up a Semelweis instance on a new machine.
# It authenticates with the container registry, writes the required
# files, and pulls the latest image.
# ─────────────────────────────────────────────────────────────────

REGISTRY="ghcr.io"
IMAGE="ghcr.io/bleak-ai/context-loader:latest"
REGISTRY_USER="bleak-ai"

INSTALL_DIR="${1:-./semelweis}"

if [ -z "${REGISTRY_TOKEN:-}" ]; then
  echo "Error: REGISTRY_TOKEN is required."
  echo "Usage: REGISTRY_TOKEN=ghp_... bash install.sh [install-dir]"
  exit 1
fi

echo "==> Installing Project Semelweis into ${INSTALL_DIR}"

# ── Check prerequisites ──────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed. See https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Error: Docker Compose V2 is required. See https://docs.docker.com/compose/install/"
  exit 1
fi

# ── Authenticate with container registry ─────────────────────────
echo "==> Authenticating with container registry..."
echo "${REGISTRY_TOKEN}" | docker login "${REGISTRY}" -u "${REGISTRY_USER}" --password-stdin

# ── Create install directory ─────────────────────────────────────
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# ── Write docker-compose.yml ─────────────────────────────────────
cat > docker-compose.yml << 'COMPOSE'
services:
  context-loader:
    image: ghcr.io/bleak-ai/context-loader:latest
    ports:
      - "8080:8080"
    env_file:
      - .env
    environment:
      - GH_OWNER=${GH_OWNER}
      - GH_REPO=${GH_REPO}
      - GH_TOKEN=${GH_TOKEN}
      - GH_BRANCH=${GH_BRANCH:-main}
      - ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN}
      - ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL}
      - ANTHROPIC_DEFAULT_OPUS_MODEL=${ANTHROPIC_DEFAULT_OPUS_MODEL:-}
      - ANTHROPIC_DEFAULT_SONNET_MODEL=${ANTHROPIC_DEFAULT_SONNET_MODEL:-}
      - ANTHROPIC_DEFAULT_HAIKU_MODEL=${ANTHROPIC_DEFAULT_HAIKU_MODEL:-}
      - INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID:-}
      - INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET:-}
      - INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID:-}
      - INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-}
      - INFISICAL_SITE_URL=${INFISICAL_SITE_URL:-}
    restart: unless-stopped
COMPOSE

# ── Write .env template ─────────────────────────────────────────
if [ ! -f .env ]; then
  touch .env
  echo "==> Created .env — fill in your credentials before starting."
else
  echo "==> .env already exists, skipping."
fi

# ── Pull the latest image ───────────────────────────────────────
echo "==> Pulling latest image..."
docker pull "${IMAGE}"

echo ""
echo "==> Installation complete!"
echo ""
echo "Next steps:"
echo "  1. cd ${INSTALL_DIR}"
echo "  2. Edit .env with your credentials"
echo "  3. docker compose up -d"
echo "  4. Open http://localhost:8080"
