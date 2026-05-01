# Veo Farm

> Web-based AI video workflow builder. Drag-drop nodes to compose pipelines: idea → script → 8s clips → 60s short-form video. All AI tools accessed via web account login (no paid API).

## Status

Sprint 7B + 8 shipped (1/5/2026). Pipeline end-to-end verified: idea → 8 scenes Veo 3 → ffmpeg concat → 22MB MP4. Glass-morphism dark UI on top of full backend.

## Quick start

### 1. System dependencies

```bash
# macOS
brew install ffmpeg

# Brave Browser (for puppeteer-based plugins like Veo 3)
# Download: https://brave.com/download/
```

Linux: `apt install ffmpeg` + Brave from https://brave.com/linux/.

### 2. Repo setup

```bash
pnpm install
cp .env.example .env
# Edit .env with Supabase URL, service role key, ENCRYPTION_KEY (32-byte hex)
```

Generate ENCRYPTION_KEY:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database

```bash
supabase db push
```

Migrations include all schema + RPC functions.

### 4. Run dev (3 terminals)

```bash
# Tab 1 — Web (Next.js)
pnpm --filter @veo-farm/web dev

# Tab 2 — Captcha-server (HTTPS, for browser extension bridge)
pnpm --filter @veo-farm/worker captcha:dev

# Tab 3 — Worker (poll Postgres jobs)
pnpm --filter @veo-farm/worker dev
```

→ http://localhost:3000

### 5. First-run setup

1. **Captcha-server cert trust**: visit https://127.0.0.1:3456/health in Brave → Advanced → Proceed (one-time, accept self-signed cert).
2. **Login web**: http://localhost:3000/login → enter your email → click magic link from inbox.
3. **Add accounts**: http://localhost:3000/accounts → "Thêm account" for each AI tool.

#### How to export cookies (per provider)

1. Install [Cookie-Editor](https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) extension in Brave.
2. Login the AI tool in browser (claude.ai, labs.google/fx/vi/tools/flow, etc.).
3. Click Cookie-Editor → Export → Export as JSON → copy.
4. Paste into Veo Farm "Thêm account" modal.

For **Veo 3**: after import, run:
```bash
cd apps/worker
node scripts/set-project-id.mjs <your-project-uuid>
```
(Project UUID from labs.google URL after creating one.)

## Architecture

```
[Idea text]
   ↓
[Claude / ChatGPT / Gemini]  ← scriptWriter node (DOM scrape via Playwright)
   ↓
JSON script (8 scenes)
   ↓
[Veo 3 Flow API replica]  ← videoRender node (puppeteer Brave + extension)
   ↓                            ─ in-page grecaptcha.enterprise.execute
   ↓                            ─ poll batchAsyncGenerateVideoText
   ↓                            ─ resolve signed CDN URL via editor page
   ↓                            ─ curl download (undici TLS rejected by CDN)
8 × MP4 clips on Supabase storage
   ↓
[FFmpeg concat]  ← concat node (system ffmpeg binary)
   ↓
[Whisper captions, music] ← optional, embedded in concat
   ↓
Final MP4 → public URL
```

### Browser runtime per plugin

| Plugin | Runtime | Why |
|---|---|---|
| `claude` / `chatgpt` / `gemini` | playwright-pool (Chrome) | DOM scrape |
| `veo3` / `veo3_flow_v2` | puppeteer Brave (standalone) | API replica + recaptcha extension |
| `flux` / `dalle` / `elevenlabs` | playwright-pool | DOM scrape |

Veo 3 is special — see SPEC_REPLICA_BACKEND.md §18.

## Maintenance scripts

```bash
cd apps/worker

# Reset accounts (status='idle', clear cooldown)
node scripts/reset-accounts.mjs

# Set veo3 project ID after re-importing cookies
node scripts/set-project-id.mjs [project-uuid]

# Standalone Veo 3 test (skip DB + worker, gen 1 video)
pnpm tsx scripts/test-veo3-direct.ts

# Force-clean stale Brave processes for a profile
pgrep -f "veo-farm-profiles" | xargs kill -9
```

## Operations notes

- **Worker heartbeat**: every 10s upserts `worker_heartbeats` table. Web reads via `/api/worker-status` for the green/red badge in nav. If badge red → start the worker.
- **Stuck running jobs**: on worker boot, jobs left in `running` status from previous crash auto-reset to `pending`. No manual cleanup needed.
- **Retry**: failed jobs show "Retry từ node fail" button on `/runs/<id>` — creates a new job with `parent_job_id` set, worker reuses parent's completed sub-job outputs (e.g. retry only concat without regenerating 8 video scenes).
- **Cookies expiry**: accounts page shows colour-coded warning (red <7d, yellow <30d). Re-export when red.
- **Profile lock**: if Brave puppeteer reports "browser is already running", `tm.launch` auto-kills stale processes via pgrep + retries 10×3s.

## Stack

- **Frontend**: Next.js 14 + React Flow + Tailwind + shadcn/ui (glass-morphism dark)
- **Backend API**: Next.js API + Supabase (Postgres + Auth + Storage)
- **Worker**: Node.js (tsx) + Playwright + puppeteer-extra-stealth + FFmpeg
- **Browser**: Brave (puppeteer) for Veo, Chrome (Playwright) for DOM scrapes
- **Captcha**: in-page `grecaptcha.enterprise.execute` (preferred) + HTTPS captcha-server bridge (fallback)
- **Cookies storage**: AES-256-GCM in Supabase

## Plugin architecture

Each AI tool is a swappable plugin implementing `ScriptProvider`, `ImageProvider`, `VideoProvider`, or `VoiceProvider`.

Active plugins:
- **Script**: claude, chatgpt, gemini
- **Image**: dalle, flux _(disabled — needs DOM rework)_
- **Video**: veo3 (Flow API replica), sora _(disabled)_
- **Voice**: veo_native, elevenlabs _(disabled)_

## Repo structure

```
veo-farm/
├── apps/
│   ├── web/                      # Next.js (UI + API)
│   └── worker/                   # Background worker
│       ├── src/
│       │   ├── _veo3_helpers/    # api-client, token-manager, captcha-bridge
│       │   ├── captcha-server/   # HTTPS server + Chrome extension
│       │   ├── core/             # job-runner, account-pool, playwright-pool
│       │   ├── nodes/            # concat, etc.
│       │   └── plugins/          # script/image/video/voice
│       └── scripts/              # maintenance + test
├── packages/
│   └── shared/                   # Types + Zod schemas
├── supabase/migrations/
├── SPEC.md                       # Original build spec
├── SPEC_REPLICA_BACKEND.md       # Veo 3 Flow API replica
├── SPEC_REPLICA_UI.md            # Glass-morphism design system
└── README.md
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ffmpeg not found` on worker boot | `brew install ffmpeg` |
| `Worker offline` badge in UI | Start worker: `pnpm --filter @veo-farm/worker dev` |
| `No idle account for provider=X after 5 retries` | `node apps/worker/scripts/reset-accounts.mjs` |
| `browser is already running for ...` | `pgrep -f veo-farm-profiles \| xargs kill -9` (auto-handled now, but if persists) |
| `Captcha bridge 503: No browser clients connected` | Visit https://127.0.0.1:3456/health in Brave once to trust cert |
| Cookies expired (login redirect) | Re-export cookies → delete + re-add account in /accounts |
| Concat fails but 8 scenes done | Click "Retry từ node fail" on /runs/<id> — reuses scenes |

## Roadmap

- ✅ Sprint 0-6 — MVP-1: monorepo, plugins skeleton, FFmpeg
- ✅ Sprint 7B — Veo 3 Flow API replica end-to-end
- ✅ Sprint 8 — Glass-morphism UI migration
- ✅ Sprint 9 — Reliability (heartbeat, retry, cookies expiry, ffmpeg check)
- ⏭ Sprint 10 — Multi-account rotation + quota tracking
- ⏭ Sprint 11 — Production deploy (Dockerfile, Railway/VPS)
- ⏭ Sprint 12 — Sora plugin restore + flow templates

## Owner

Hai Phan (phanhai.work@gmail.com)

## License

Private. Not for distribution.
