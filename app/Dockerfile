FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn jinja2 python-multipart

COPY app/server.py app/__init__.py ./
COPY app/templates/ templates/
COPY modules/ modules/

ENV MODULES_DIR=/app/modules

RUN mkdir -p context

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
