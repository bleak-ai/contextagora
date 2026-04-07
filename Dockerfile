# Stage 1: Build React frontend
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY platform/frontend/package*.json .
RUN npm ci
COPY platform/frontend/ .
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.12-slim

RUN pip install --no-cache-dir uv
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/* \
    && curl -sSfL https://varlock.dev/install.sh | sh -s -- --dir=/usr/local/bin --force-no-brew --version=0.7.1 \
    && varlock --version

# Install Node.js and Claude Code
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY platform/pyproject.toml platform/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

COPY platform/src/ src/
RUN uv sync --no-dev --frozen

# Copy built frontend into static directory
COPY --from=frontend /app/frontend/dist src/static/

RUN mkdir -p src/context

# ── Required runtime variables ───────────────────────────────
ENV GH_OWNER=""
ENV GH_REPO=""
ENV GH_TOKEN=""
ENV GH_BRANCH="main"
ENV ANTHROPIC_AUTH_TOKEN=""
ENV ANTHROPIC_BASE_URL=""
# ── Optional: model overrides ────────────────────────────────
ENV ANTHROPIC_DEFAULT_OPUS_MODEL=""
ENV ANTHROPIC_DEFAULT_SONNET_MODEL=""
ENV ANTHROPIC_DEFAULT_HAIKU_MODEL=""
# ── Optional: Infisical (only if modules use secrets) ────────
ENV INFISICAL_CLIENT_ID=""
ENV INFISICAL_CLIENT_SECRET=""
ENV INFISICAL_PROJECT_ID=""
ENV INFISICAL_ENVIRONMENT=""
ENV INFISICAL_SITE_URL=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uv", "run", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080"]
