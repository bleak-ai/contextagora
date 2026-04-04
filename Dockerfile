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

ENV MODULES_DIR=/app/modules

RUN mkdir -p src/context

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uv", "run", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080"]
