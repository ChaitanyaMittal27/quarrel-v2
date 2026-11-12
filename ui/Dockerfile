# Web image: builds the UI, then serves it with nginx, which also routes /api and /socket.io
# to the API. Build from the repo root:
#   docker build -f ui/Dockerfile .

# ---- build: install the ui and shared workspaces and run the Vite build ----
FROM node:24-slim AS build
WORKDIR /app

# Manifests first for layer caching. server/package.json is copied (manifest only) because
# the root lockfile lists the server workspace.
COPY package.json package-lock.json ./
COPY ui/package.json ui/
COPY shared/package.json shared/
COPY server/package.json server/
# Dev dependencies are needed here: Vite and TypeScript do the build.
RUN npm ci --workspace=@quarrel/ui --workspace=@quarrel/shared

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY ui/ ui/
RUN npm run build --workspace=@quarrel/ui

# ---- web: static files + routing ----
FROM nginx:alpine AS web
# Our config replaces the default site (it is included inside nginx's `http` block).
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/ui/dist /usr/share/nginx/html
EXPOSE 80
