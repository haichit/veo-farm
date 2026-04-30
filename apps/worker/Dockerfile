# Veo Farm worker — Playwright + FFmpeg + Whisper-ready
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# System deps: ffmpeg for video, build tools for whisper.cpp later
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace manifests first for caching
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile --filter "@veo-farm/worker..."

# Copy source
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

RUN pnpm --filter @veo-farm/worker build

WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
