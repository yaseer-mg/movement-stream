# apps/api-server/Dockerfile
# ============================================================
# API Server — Express REST API + WebSocket
# Node 20 LTS (bookworm-slim) — bcrypt ships glibc prebuilds
# for this ABI, so no compiler toolchain is needed.
# ============================================================

FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

EXPOSE 4000
CMD ["node", "src/index.js"]
