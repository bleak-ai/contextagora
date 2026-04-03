FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY platform/pyproject.toml platform/uv.lock ./
RUN uv sync --no-dev --frozen

COPY platform/src/ src/
COPY fixtures/ fixtures/

ENV MODULES_DIR=/app/fixtures

RUN mkdir -p src/context

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8080"]
