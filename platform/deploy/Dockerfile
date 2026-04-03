FROM python:3.12-slim

RUN pip install --no-cache-dir uv
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/* \
    && curl -sSfL https://varlock.dev/install.sh | sh -s -- --dir=/usr/local/bin --force-no-brew --version=0.7.1 \
    && varlock --version

WORKDIR /app

COPY platform/pyproject.toml platform/uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

COPY platform/src/ src/
RUN uv sync --no-dev --frozen

ENV MODULES_DIR=/app/fixtures

RUN mkdir -p src/context

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080"]
