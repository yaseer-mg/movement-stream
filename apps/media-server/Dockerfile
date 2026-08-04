# apps/media-server/Dockerfile
# ============================================================
# Media Server — WebRTC WHIP ingest + FFmpeg transcode + HLS
# Node 18 LTS (bookworm-slim): node-webrtc (wrtc) 0.4.x ships
# prebuilt binaries for Node 18 linux-x64. Build tools are still
# installed as a fallback so a from-source compile succeeds if
# no prebuild is available. FFmpeg + ffprobe are required at
# runtime for transcoding and recording.
# ============================================================

FROM node:18-bookworm-slim

# FFmpeg + ffprobe (runtime) and C++ toolchain (fallback compile)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        make \
        g++ \
        cmake \
        ninja-build \
        libc++-dev \
        libc++abi-dev \
        libnss3-dev \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

EXPOSE 3001
CMD ["node", "src/index.js"]
