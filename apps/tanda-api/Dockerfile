# syntax=docker.io/docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - Install Python dependencies.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS deps

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY apps/tanda-api/requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2 - Build static files.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /app
COPY --from=deps /install /usr/local
COPY apps/tanda-api/ .

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN DJANGO_SETTINGS_MODULE=tanda_api.settings \
    SECRET_KEY=build-time-secret-key \
    python manage.py collectstatic --noinput

# ---------------------------------------------------------------------------
# Stage 3 - Minimal production image.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*

COPY --from=deps /install /usr/local
COPY --from=builder /app /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=tanda_api.settings

RUN addgroup --system --gid 1001 django && \
    adduser --system --uid 1001 --ingroup django django && \
    mkdir -p /app/media && chown -R django:django /app

COPY apps/tanda-api/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER django

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "tanda_api.wsgi:application"]
