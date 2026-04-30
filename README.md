# Veo Farm

> Web-based AI video workflow builder. Drag-drop nodes to compose pipelines: idea → script → storyboard → 8s clips → 60s short-form video. All AI tools accessed via web account login (no API).

## Status

Planning — design complete 2026-04-29. Build with Claude Code following [SPEC.md](./SPEC.md).

## What it does

```
[Idea text]
   ↓
[ChatGPT/Gemini/Claude] writes JSON script
   ↓
[DALL-E/Flux] renders 8 storyboard images (consistent character via image ref)
   ↓
[Veo 3] renders 8 × 8s video clips (using each image as reference)
   ↓
[ElevenLabs/Veo native] generates voiceover
   ↓
[FFmpeg] concats + adds music + Whisper captions
   ↓
[Download] 60s MP4 ready for TikTok / FB Reels
```

## Why

- Tool stacks like Picsart/Submagic exist but lock to fixed providers.
- Veo 3 web account is **30-50x cheaper** than API at scale.
- Multi-account pool + plugin architecture = swap provider, swap account, scale to 100+ videos/day.

## Stack

- **Frontend:** Next.js 14 + React Flow + Tailwind + shadcn/ui → Vercel
- **Backend:** Next.js API + Supabase (DB + Auth + Storage + Realtime)
- **Worker:** Node.js + Playwright + FFmpeg + Whisper → Railway
- **Cookies:** AES-256-GCM encrypted in Supabase

## Plugin architecture

Each AI tool is a swappable plugin implementing a standard interface (`ScriptProvider`, `ImageProvider`, `VideoProvider`, `VoiceProvider`).

MVP-1 plugins:
- **Script:** ChatGPT, Gemini, Claude
- **Image:** DALL-E (via ChatGPT), Flux (via replicate.com)
- **Video:** Veo 3 (via labs.google/flow)
- **Voice:** Veo native, ElevenLabs

## Repo structure

```
veo-farm/
├── apps/
│   ├── web/          # Next.js frontend + API
│   └── worker/       # Node.js worker (Playwright + FFmpeg)
├── packages/
│   └── shared/       # Shared types + Zod schemas
├── supabase/
│   └── migrations/
├── SPEC.md           # Full build spec (paste this into Claude Code)
└── README.md
```

## Getting started

See [SPEC.md](./SPEC.md) for full build instructions for Claude Code.

Quick:

```bash
# 1. Install
pnpm install

# 2. Setup .env from .env.example
cp .env.example .env

# 3. Run Supabase migrations
supabase db push

# 4. Dev (web + worker)
pnpm dev
```

## Roadmap

- **MVP-1** (~3 weeks): 8 plugins, 1 flow, 1 worker, account manager, end-to-end 60s video.
- **MVP-2** (~1-2 weeks): Multi-flow, batch CSV, per-node concurrency UI.
- **MVP-3** (~2 weeks): Add Imagen, Sora, Kling, Hailuo, Suno, Submagic.
- **Phase 2** (~3-4 weeks): Auto-post TikTok/FB/YT, schedule, multi-tenant for CMAX team.

## Owner

Hai Phan ([phanhai.work@gmail.com](mailto:phanhai.work@gmail.com))

## License

Private. Not for distribution.

## Related docs (in vault)

- Design doc: `wiki/sources/projects/veo-farm.md`
- Decision: `wiki/sources/decisions/2026-04-29-launch-veo-farm.md`
- Entity: `wiki/entities/veo-farm.md`
