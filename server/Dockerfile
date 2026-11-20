# API and worker image. Build from the repo root:
#   docker build -f server/Dockerfile --target api .
#   docker build -f server/Dockerfile --target worker .
# Both targets have the same contents; only the start command differs.
# TypeScript runs directly through tsx (a production dependency of @quarrel/server), so there is
# no compile step. Environment variables come from docker compose, never from the image.

# ---- base: install production dependencies for the server and shared workspaces ----
FROM node:24-slim AS base
ENV NODE_ENV=production

# Everything below runs as the unprivileged `node` user that the image provides, and files are
# owned by it as they are copied (a later `chown -R` would store every file a second time).
RUN mkdir /app && chown node:node /app
USER node
WORKDIR /app

# Package manifests first, so Docker can reuse the installed layer when only source changes.
# ui/package.json is copied (manifest only) because the root lockfile lists the ui workspace.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server/package.json server/
COPY --chown=node:node shared/package.json shared/
COPY --chown=node:node ui/package.json ui/
RUN npm ci --omit=dev --workspace=@quarrel/server --workspace=@quarrel/shared \
    && npm cache clean --force

# Source. tsconfig files are needed by tsx to resolve the shared TypeScript settings.
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node shared/ shared/
COPY --chown=node:node server/ server/
COPY --chown=node:node db/migrations/ db/migrations/

WORKDIR /app/server

# ---- api: Fastify + Socket.IO on API_PORT (4000) ----
FROM base AS api
EXPOSE 4000
# `node --import tsx` keeps a single process, so SIGTERM from `docker stop` reaches the
# shutdown handler in api/index.ts directly.
CMD ["node", "--import", "tsx", "api/index.ts"]

# ---- worker: BullMQ worker ----
FROM base AS worker
CMD ["node", "--import", "tsx", "worker/index.ts"]
