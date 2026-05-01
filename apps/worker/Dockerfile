# Veo Farm worker — Playwright + Brave (for Veo plugin) + FFmpeg
# Multi-purpose image:
#  - Playwright Chromium (DOM-scrape plugins: claude, chatgpt, gemini)
#  - Brave Browser (puppeteer-based Veo 3 plugin with reCAPTCHA extension)
#  - FFmpeg (concat node)

FROM mcr.microsoft.com/playwright:v1.47.0-jammy

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV BRAVE_PATH=/usr/bin/brave-browser
ENV WORKER_PROFILES_DIR=/data/veo-farm-profiles

# System deps + Brave Browser
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      gnupg \
      apt-transport-https \
    && curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
       https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main" \
       > /etc/apt/sources.list.d/brave-browser-release.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends brave-browser \
    && rm -rf /var/lib/apt/lists/*

# Persistent volume for Brave profiles (cookies, login state)
RUN mkdir -p /data/veo-farm-profiles && chmod 777 /data/veo-farm-profiles
VOLUME /data/veo-farm-profiles

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

# Healthcheck: worker touches /tmp/worker-alive on each heartbeat.
# Stale > 60s = unhealthy → orchestrator restarts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD test -f /tmp/worker-alive \
   && [ "$(($(date +%s) - $(stat -c %Y /tmp/worker-alive)))" -lt 60 ] \
   || exit 1

CMD ["node", "dist/index.js"]
