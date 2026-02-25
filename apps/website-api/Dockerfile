# syntax=docker.io/docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1 – Install Python dependencies
# Only requirements.txt is copied so source changes don't bust this layer.
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY apps/website-api/requirements.txt .

RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────
# Stage 2 – Collect and compress static assets
# WhiteNoise's CompressedManifestStaticFilesStorage bakes hashed,
# gzip-compressed copies into staticfiles/ at build time.
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

COPY --from=deps /install /usr/local
COPY apps/website-api/ .

# SECRET_KEY is required by Django's settings module even during collectstatic.
# This value is only used at build time and is never exposed at runtime.
RUN DJANGO_SETTINGS_MODULE=website_api.settings \
    SECRET_KEY=build-time-static-collection \
    python manage.py collectstatic --noinput

# ─────────────────────────────────────────────────────────────
# Stage 3 – Minimal production image
# ─────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

WORKDIR /app

# Non-root user for security
RUN groupadd --system django && useradd --system --gid django django

# Runtime packages from the deps stage
COPY --from=deps /install /usr/local

# Application source + pre-built staticfiles
COPY --from=builder /app/ .

# Media directory — will be overridden by the hostPath volume mount at runtime
RUN mkdir -p /app/media \
    && chown -R django:django /app/media /app/staticfiles

USER django

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=website_api.settings

EXPOSE 8000

# 2 sync workers is appropriate for a 0.5-CPU container.
# Increase via GUNICORN_WORKERS env var or by editing the Helm values.
CMD ["gunicorn", "website_api.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "120"]
