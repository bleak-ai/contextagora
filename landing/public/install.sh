#!/usr/bin/env bash
set -euo pipefail

# ── ContextAgora Installer ───────────────────────────────────────
# This script sets up a ContextAgora instance on a new machine.
# It writes the required files and pulls the latest image.
# ─────────────────────────────────────────────────────────────────

IMAGE="ghcr.io/bleak-ai/contextagora:latest"

INSTALL_DIR="${1:-./contextagora}"

echo "==> Installing ContextAgora into ${INSTALL_DIR}"

# ── Check prerequisites ──────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed. See https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Error: Docker Compose V2 is required. See https://docs.docker.com/compose/install/"
  exit 1
fi

# ── Create install directory ─────────────────────────────────────
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# ── Write docker-compose.yml ─────────────────────────────────────
cat > docker-compose.yml << 'COMPOSE'
services:
  contextagora:
    image: ghcr.io/bleak-ai/contextagora:latest
    ports:
      - "9090:9090"
    env_file:
      - .env
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
echo "  4. Open http://localhost:9090"
