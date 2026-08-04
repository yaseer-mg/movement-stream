# apps/web/Dockerfile
# ============================================================
# Web — React + Vite + Tailwind frontend
# Multi-stage build:
#   1. node:20-alpine — runs `vite build` (VITE_* env baked in
#      at build time via ARG).
#   2. nginx:alpine — serves the static bundle on port 80.
# The built files are shared with the edge nginx container via
# the `web_build` named volume in docker-compose.yml.
# ============================================================

# ─── Build stage ───
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Public URLs baked into the bundle at build time.
# Defaults assume the app is served behind the edge nginx
# (same origin). Override via compose build args.
ARG VITE_API_URL=""
ARG VITE_WS_URL=""
ARG VITE_HLS_URL="/hls"
ARG VITE_MEDIA_SERVER_URL="/whip"

ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_HLS_URL=$VITE_HLS_URL \
    VITE_MEDIA_SERVER_URL=$VITE_MEDIA_SERVER_URL

RUN npm run build

# ─── Serve stage ───
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
