# syntax=docker/dockerfile:1
#
# Free Claude Code — self-hosted server (Admin UI + provider proxy).
#
# The admin UI is ALWAYS rebuilt from source in this image: the committed
# admin_static assets are excluded from the build context (.dockerignore) and
# the freshly built bundle is overlaid over the packaged assets, so a rebuild
# can never serve a stale UI. Deploy with:
#
#   docker compose up -d --build          # incremental (fast)
#   docker compose up -d --build --no-cache  # guaranteed full rebuild

# ---- Stage 1: build the admin UI ----
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

# Lockfile first so `npm ci` is cached until the frontend actually changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
# Output lands in /build/src/free_claude_code/api/admin_static via
# vite.config.ts `outDir`.

# ---- Stage 2: Python runtime ----
FROM python:3.14-slim AS backend

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    FCC_OPEN_BROWSER=false

COPY --from=ghcr.io/astral-sh/uv:0.11.18 /uv /uvx /bin/

WORKDIR /app

# Install deps and the package first; source layering keeps the sync cached.
COPY pyproject.toml uv.lock README.md .env.example ./
COPY src/ ./src/
# Overlay the freshly built admin UI (fresh bundle wins over committed assets).
COPY --from=frontend-builder /build/src/free_claude_code/api/admin_static/ \
    ./src/free_claude_code/api/admin_static/

RUN uv sync --frozen --no-dev \
    && useradd --create-home --shell /bin/bash fcc \
    && chown -R fcc:fcc /app

COPY --chown=fcc docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER fcc
EXPOSE 8082

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["fcc-server"]
