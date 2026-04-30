# Veo Farm — Build Spec for Claude Code

**Version:** 1.0
**Date:** 2026-04-29
**Owner:** Hai Phan
**Target builder:** Claude Code (paste this entire file into Claude Code session as the build instruction)

---

## 0. Mission

Build a **web-based AI video workflow builder** with drag-drop node UI (like n8n / Langflow / ComfyUI). Users compose a workflow that:

1. Takes a 1-line idea (e.g. "Mèo Mochi đi Đà Lạt 1 ngày")
2. Sends to ChatGPT/Gemini/Claude → generates structured JSON script (character bible + scene bible + 8 scenes with image_prompt + video_prompt + voice_script)
3. Sends each scene's image_prompt to DALL-E/Flux → generates 8 storyboard images
4. Sends each scene's image + video_prompt + voice_script to Veo 3 → generates 8 × 8s clips
5. Optionally generates voiceover via ElevenLabs (or uses Veo native audio)
6. Concats clips with FFmpeg, adds music + Whisper-generated captions
7. User downloads final 60s MP4

**Critical constraint:** ALL AI tools are accessed via **web browser automation with logged-in user accounts**, NOT via API. Use Playwright + cookies-based auth.

**Architecture must be plugin-based** — each AI tool is a swappable provider implementing a standard interface.

---

## 1. Tech Stack (FIXED)

### Frontend (apps/web)

- **Framework:** Next.js 14 App Router + TypeScript strict
- **Canvas lib:** [React Flow / xyflow](https://reactflow.dev/) v12+
- **Styling:** Tailwind CSS + shadcn/ui
- **Icons:** lucide-react
- **State:** Zustand (for canvas state) + React Query (for API)
- **Deploy:** Vercel (hobby plan)

### Backend API

- **Same Next.js app**, API routes under `/api/*`
- **Auth:** Supabase Auth (email magic link, single user MVP)
- **DB:** Supabase Postgres (free tier)
- **Storage:** Supabase Storage (`media` bucket for images + videos)
- **Realtime:** Supabase Realtime (push job/sub-job status updates to UI)

### Worker (apps/worker)

- **Runtime:** Node.js 20 + TypeScript
- **Browser automation:** Playwright (chromium, headful for debug / headless for prod)
- **Video processing:** `fluent-ffmpeg` (wrapper around FFmpeg system binary)
- **Captions:** `whisper.cpp` Node binding (or `nodejs-whisper`)
- **Container:** Docker (Dockerfile installs Playwright deps + FFmpeg + Whisper model)
- **Deploy:** Railway (1 worker MVP, persistent volume for Playwright cache)
- **Secrets:** Railway env vars (Supabase URL, service role key, encryption key)

### Monorepo

- **Tool:** pnpm workspaces + Turbo
- **Shared package:** `packages/shared` — TypeScript types, Zod schemas, plugin interfaces

---

## 2. Repository Structure

```
veo-farm/
├── apps/
│   ├── web/                              # Next.js app
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   └── login/page.tsx
│   │   │   ├── (app)/
│   │   │   │   ├── layout.tsx            # sidebar nav
│   │   │   │   ├── flows/
│   │   │   │   │   ├── page.tsx          # list flows
│   │   │   │   │   └── [id]/page.tsx     # canvas editor
│   │   │   │   ├── accounts/
│   │   │   │   │   └── page.tsx          # account manager
│   │   │   │   ├── runs/
│   │   │   │   │   ├── page.tsx          # job history list
│   │   │   │   │   └── [id]/page.tsx     # job detail + progress
│   │   │   │   └── page.tsx              # dashboard
│   │   │   ├── api/
│   │   │   │   ├── flows/route.ts        # POST/GET flows
│   │   │   │   ├── flows/[id]/route.ts   # GET/PATCH/DELETE
│   │   │   │   ├── accounts/route.ts
│   │   │   │   ├── accounts/[id]/route.ts
│   │   │   │   ├── runs/route.ts         # POST run
│   │   │   │   └── runs/[id]/route.ts    # GET status
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── canvas/
│   │   │   │   ├── FlowCanvas.tsx        # main React Flow wrapper
│   │   │   │   ├── NodeSidebar.tsx       # drag-from sidebar
│   │   │   │   └── NodeConfigPanel.tsx   # right panel when node selected
│   │   │   ├── nodes/
│   │   │   │   ├── BaseNode.tsx          # shared header / handle / status
│   │   │   │   ├── IdeaInputNode.tsx
│   │   │   │   ├── ScriptWriterNode.tsx
│   │   │   │   ├── ImageGeneratorNode.tsx
│   │   │   │   ├── VideoRenderNode.tsx
│   │   │   │   ├── VoiceGenNode.tsx
│   │   │   │   ├── ConcatNode.tsx
│   │   │   │   └── DownloadNode.tsx
│   │   │   ├── account-manager/
│   │   │   │   ├── AccountList.tsx
│   │   │   │   ├── AddAccountModal.tsx
│   │   │   │   └── AccountStatusBadge.tsx
│   │   │   ├── run-progress/
│   │   │   │   └── RunProgressView.tsx   # tree of sub-jobs with progress
│   │   │   └── ui/                       # shadcn/ui components
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts
│   │   │   │   ├── server.ts
│   │   │   │   └── types.ts              # generated from supabase
│   │   │   ├── flow/
│   │   │   │   ├── validator.ts          # validate flow graph
│   │   │   │   └── default-flows.ts      # template flows
│   │   │   ├── encryption.ts             # encrypt/decrypt cookies (AES-256-GCM)
│   │   │   └── utils.ts
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tailwind.config.ts
│   │   └── tsconfig.json
│   │
│   └── worker/
│       ├── src/
│       │   ├── index.ts                  # entrypoint, poll loop
│       │   ├── core/
│       │   │   ├── job-runner.ts         # parse graph, execute nodes
│       │   │   ├── node-executor.ts      # execute single node, fan-out sub-jobs
│       │   │   ├── account-pool.ts       # claim/release with cooldown
│       │   │   ├── playwright-pool.ts    # browser context per account
│       │   │   ├── storage.ts            # upload to Supabase Storage
│       │   │   ├── encryption.ts         # decrypt cookies
│       │   │   └── logger.ts             # structured logs
│       │   ├── plugins/
│       │   │   ├── registry.ts           # auto-discover & load plugins
│       │   │   ├── script/
│       │   │   │   ├── _interface.ts
│       │   │   │   ├── chatgpt.ts
│       │   │   │   ├── gemini.ts
│       │   │   │   └── claude.ts
│       │   │   ├── image/
│       │   │   │   ├── _interface.ts
│       │   │   │   ├── dalle.ts
│       │   │   │   └── flux.ts
│       │   │   ├── video/
│       │   │   │   ├── _interface.ts
│       │   │   │   └── veo3.ts
│       │   │   └── voice/
│       │   │       ├── _interface.ts
│       │   │       ├── veo_native.ts
│       │   │       └── elevenlabs.ts
│       │   └── nodes/
│       │       ├── concat.ts             # FFmpeg concat + transitions
│       │       ├── caption.ts            # Whisper subtitle generation
│       │       └── music.ts              # add bg music (file from media library)
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── flow.ts               # FlowGraph, Node, Edge
│       │   │   ├── account.ts            # Account, AccountStatus
│       │   │   ├── job.ts                # Job, SubJob, JobStatus
│       │   │   └── plugin.ts             # ScriptProvider, ImageProvider, VideoProvider, VoiceProvider
│       │   ├── schemas/
│       │   │   └── *.ts                  # Zod schemas matching types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260429000001_init.sql
│   │   ├── 20260429000002_accounts.sql
│   │   ├── 20260429000003_jobs.sql
│   │   ├── 20260429000004_rpc_claim_account.sql
│   │   └── 20260429000005_storage_policies.sql
│   ├── seed.sql
│   └── config.toml
│
├── .env.example
├── .gitignore
├── package.json                          # workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
└── SPEC.md                               # this file
```

---

## 3. Database Schema (Supabase Postgres)

### Migration 0001 — init

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users (Supabase auth.users; profile extension)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Flows
CREATE TABLE public.flows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_flows_user ON public.flows(user_id);

-- RLS
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY flows_owner ON public.flows
  USING (user_id = auth.uid());
```

### Migration 0002 — accounts

```sql
CREATE TYPE public.account_status AS ENUM ('idle', 'busy', 'cooldown', 'expired', 'die');

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,           -- 'chatgpt' | 'gemini' | 'claude' | 'flux' | 'veo3' | 'elevenlabs'
  label text NOT NULL,                 -- human-friendly name
  cookies_encrypted text NOT NULL,     -- AES-256-GCM ciphertext (base64)
  status account_status NOT NULL DEFAULT 'idle',
  cooldown_until timestamptz,
  last_used_at timestamptz,
  last_error text,
  meta jsonb DEFAULT '{}'::jsonb,      -- { email, plan, expires_at, ... }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_accounts_user_provider ON public.accounts(user_id, provider_id);
CREATE INDEX idx_accounts_status ON public.accounts(provider_id, status, cooldown_until);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner ON public.accounts USING (user_id = auth.uid());
```

### Migration 0003 — jobs + sub_jobs

```sql
CREATE TYPE public.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'pending',
  input jsonb,                         -- { idea: "...", batch?: [...] }
  output_url text,                     -- final MP4 URL
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_jobs_status ON public.jobs(status, created_at);
CREATE INDEX idx_jobs_user ON public.jobs(user_id, created_at DESC);

CREATE TABLE public.sub_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  node_id text NOT NULL,               -- React Flow node id
  node_type text NOT NULL,             -- 'script' | 'image' | 'video' | 'voice' | 'concat' | 'caption'
  provider_id text,                    -- nullable for concat/caption
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  status job_status NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error text,
  retry_count int DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sub_jobs_job ON public.sub_jobs(job_id);
CREATE INDEX idx_sub_jobs_status ON public.sub_jobs(status);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_owner ON public.jobs USING (user_id = auth.uid());
CREATE POLICY sub_jobs_owner ON public.sub_jobs
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = sub_jobs.job_id AND j.user_id = auth.uid()));
```

### Migration 0004 — RPC claim_account

```sql
CREATE OR REPLACE FUNCTION public.claim_account(p_user_id uuid, p_provider_id text)
RETURNS public.accounts AS $$
DECLARE acc public.accounts;
BEGIN
  UPDATE public.accounts
  SET status = 'busy', last_used_at = now(), updated_at = now()
  WHERE id = (
    SELECT id FROM public.accounts
    WHERE user_id = p_user_id
      AND provider_id = p_provider_id
      AND status = 'idle'
      AND (cooldown_until IS NULL OR cooldown_until < now())
    ORDER BY last_used_at NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO acc;
  RETURN acc;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.release_account(
  p_account_id uuid,
  p_cooldown_sec int DEFAULT 300,
  p_new_status public.account_status DEFAULT 'idle',
  p_error text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE public.accounts
  SET status = p_new_status,
      cooldown_until = CASE WHEN p_new_status = 'idle' THEN now() + (p_cooldown_sec || ' seconds')::interval ELSE NULL END,
      last_error = p_error,
      updated_at = now()
  WHERE id = p_account_id;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for worker to claim next pending job
CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS public.jobs AS $$
DECLARE j public.jobs;
BEGIN
  UPDATE public.jobs
  SET status = 'running', started_at = now()
  WHERE id = (
    SELECT id FROM public.jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO j;
  RETURN j;
END $$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Migration 0005 — storage policies

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false);

CREATE POLICY "Users can upload to own folder" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own files" ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
```

---

## 4. Plugin Interfaces (packages/shared/src/types/plugin.ts)

```typescript
import { Page } from 'playwright';
import { Account } from './account';

// === COMMON ===

export interface PluginExecutionContext {
  page: Page;
  account: Account;
  cookies: Cookie[];
  logger: Logger;
  abortSignal: AbortSignal;
  uploadFile: (buffer: Buffer, ext: string) => Promise<string>; // returns Storage URL
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

// === SCRIPT ===

export interface ScriptProvider {
  id: string;                      // 'chatgpt' | 'gemini' | 'claude'
  name: string;
  url: string;                     // tool homepage
  loginUrl: string;                // page to verify login
  generateScript(
    input: ScriptInput,
    ctx: PluginExecutionContext
  ): Promise<ScriptOutput>;
}

export interface ScriptInput {
  idea: string;
  systemPrompt: string;            // user-customizable template
  targetDurationSec?: number;      // default 60
  numScenes?: number;              // default 8
}

export interface ScriptOutput {
  character_bible: {
    name: string;
    appearance: string;
    personality: string;
  };
  scene_bible: {
    setting: string;
    visual_style: string;
    camera: string;
  };
  scenes: Array<{
    id: number;
    duration_sec: number;
    image_prompt: string;
    video_prompt: string;
    voice_script: string;
  }>;
  audio: {
    music_mood: string;
    voice_style: string;
  };
  post: {
    title: string;
    caption: string;
    hashtags: string[];
  };
}

// === IMAGE ===

export interface ImageProvider {
  id: string;                      // 'dalle' | 'flux' | 'imagen'
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    supports_ref_image: boolean;   // for character consistency
    supports_aspect_ratio: string[];
  };
  generateImage(
    input: ImageInput,
    ctx: PluginExecutionContext
  ): Promise<ImageOutput>;
}

export interface ImageInput {
  prompt: string;
  refImageUrl?: string;            // for consistency (use 1st generated image as ref for rest)
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export interface ImageOutput {
  imageUrl: string;                // Supabase Storage URL
  mimeType: string;
  width: number;
  height: number;
}

// === VIDEO ===

export interface VideoProvider {
  id: string;                      // 'veo3' | 'sora' | 'kling'
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    max_duration_sec: number;
    supports_image_ref: boolean;
    supports_voice_in_prompt: boolean;
    aspect_ratios: string[];
  };
  generateVideo(
    input: VideoInput,
    ctx: PluginExecutionContext
  ): Promise<VideoOutput>;
}

export interface VideoInput {
  prompt: string;
  refImageUrl?: string;            // image-to-video
  voiceScript?: string;            // for tools that support voice in prompt (Veo 3)
  durationSec: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export interface VideoOutput {
  videoUrl: string;                // Supabase Storage URL
  durationSec: number;
  hasAudio: boolean;
}

// === VOICE ===

export interface VoiceProvider {
  id: string;                      // 'veo_native' | 'elevenlabs' | 'google_tts'
  name: string;
  url: string;
  loginUrl: string;
  capabilities: {
    languages: string[];
    voices: Array<{ id: string; name: string; gender: 'male' | 'female' | 'neutral' }>;
  };
  generateVoice(
    input: VoiceInput,
    ctx: PluginExecutionContext
  ): Promise<VoiceOutput>;
}

export interface VoiceInput {
  text: string;
  voiceId: string;
  language: string;
}

export interface VoiceOutput {
  audioUrl: string;
  durationSec: number;
}
```

---

## 5. Worker Job Runner Logic

```typescript
// apps/worker/src/index.ts (high-level pseudocode)

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  await loadAllPlugins();

  while (true) {
    const job = await supabase.rpc('claim_next_job').single();
    if (!job) {
      await sleep(3000);
      continue;
    }

    try {
      await runJob(job);
      await supabase.from('jobs').update({ status: 'completed', finished_at: new Date() }).eq('id', job.id);
    } catch (err) {
      await supabase.from('jobs').update({ status: 'failed', error: err.message, finished_at: new Date() }).eq('id', job.id);
    }
  }
}

async function runJob(job: Job) {
  const { graph } = await fetchFlow(job.flow_id);
  const order = topologicalSort(graph);

  // Execute nodes in topological order; "fan-out" nodes spawn parallel sub-jobs
  const nodeOutputs = new Map<string, any>();

  for (const node of order) {
    const inputs = collectInputs(node, graph, nodeOutputs);
    const output = await executeNode(node, inputs, job);
    nodeOutputs.set(node.id, output);
  }

  // Final output is from Download node
  const downloadNode = graph.nodes.find(n => n.type === 'download');
  return nodeOutputs.get(downloadNode.id);
}

async function executeNode(node, inputs, job): Promise<any> {
  switch (node.type) {
    case 'ideaInput':
      return inputs.value || job.input.idea;

    case 'scriptWriter': {
      const provider = pluginRegistry.get('script', node.data.provider);
      const subJob = await createSubJob(job.id, node.id, 'script', node.data.provider);
      const account = await claimAccountWithRetry(node.data.provider);
      const ctx = await buildContext(account, subJob);
      const result = await provider.generateScript({ idea: inputs.idea, systemPrompt: node.data.config.system_prompt }, ctx);
      await releaseAccount(account.id, 300);
      await completeSubJob(subJob.id, result);
      return result; // ScriptOutput
    }

    case 'imageGenerator': {
      // FAN-OUT: 1 sub-job per scene
      const scriptOutput: ScriptOutput = inputs.script;
      const concurrency = node.data.concurrency || 'auto';

      const subJobs = await Promise.all(
        scriptOutput.scenes.map((scene, i) =>
          createSubJob(job.id, node.id, 'image', node.data.provider, { scene })
        )
      );

      // First image: no ref. Subsequent images: use first as ref for consistency.
      const provider = pluginRegistry.get('image', node.data.provider);
      const results: ImageOutput[] = [];

      // First scene synchronously
      const firstAccount = await claimAccountWithRetry(node.data.provider);
      const firstCtx = await buildContext(firstAccount, subJobs[0]);
      results[0] = await provider.generateImage(
        { prompt: scriptOutput.scenes[0].image_prompt, aspectRatio: '9:16' },
        firstCtx
      );
      await releaseAccount(firstAccount.id, 300);

      // Remaining scenes parallel with ref = results[0].imageUrl
      const remaining = scriptOutput.scenes.slice(1);
      const limit = pLimit(concurrency === 'auto' ? remaining.length : concurrency);
      const tasks = remaining.map((scene, idx) => limit(async () => {
        const account = await claimAccountWithRetry(node.data.provider);
        const ctx = await buildContext(account, subJobs[idx + 1]);
        const out = await provider.generateImage(
          { prompt: scene.image_prompt, refImageUrl: results[0].imageUrl, aspectRatio: '9:16' },
          ctx
        );
        await releaseAccount(account.id, 300);
        await completeSubJob(subJobs[idx + 1].id, out);
        return out;
      }));
      const rest = await Promise.all(tasks);
      results.push(...rest);

      return results; // ImageOutput[]
    }

    case 'videoRender': {
      const scriptOutput: ScriptOutput = inputs.script;
      const images: ImageOutput[] = inputs.images;
      // Fan-out 1 sub-job per scene, parallel
      const provider = pluginRegistry.get('video', node.data.provider);
      const concurrency = node.data.concurrency || 'auto';

      const limit = pLimit(concurrency === 'auto' ? scriptOutput.scenes.length : concurrency);
      const tasks = scriptOutput.scenes.map((scene, i) => limit(async () => {
        const subJob = await createSubJob(job.id, node.id, 'video', node.data.provider, { scene });
        const account = await claimAccountWithRetry(node.data.provider);
        const ctx = await buildContext(account, subJob);
        const out = await provider.generateVideo({
          prompt: scene.video_prompt,
          refImageUrl: images[i]?.imageUrl,
          voiceScript: scene.voice_script,  // if Veo native voice mode
          durationSec: scene.duration_sec,
          aspectRatio: '9:16'
        }, ctx);
        await releaseAccount(account.id, 600); // Veo cooldown longer
        await completeSubJob(subJob.id, out);
        return out;
      }));
      return await Promise.all(tasks); // VideoOutput[]
    }

    case 'voiceGen': {
      // Optional: only run if user picks ElevenLabs (skip if Veo native)
      if (node.data.provider === 'veo_native') return null;
      const scriptOutput: ScriptOutput = inputs.script;
      const provider = pluginRegistry.get('voice', node.data.provider);
      const limit = pLimit(node.data.concurrency || 1);
      const tasks = scriptOutput.scenes.map((scene, i) => limit(async () => {
        const subJob = await createSubJob(job.id, node.id, 'voice', node.data.provider);
        const account = await claimAccountWithRetry(node.data.provider);
        const ctx = await buildContext(account, subJob);
        const out = await provider.generateVoice({
          text: scene.voice_script,
          voiceId: node.data.config.voice_id,
          language: 'vi'
        }, ctx);
        await releaseAccount(account.id, 60);
        await completeSubJob(subJob.id, out);
        return out;
      }));
      return await Promise.all(tasks); // VoiceOutput[]
    }

    case 'concat': {
      const videos: VideoOutput[] = inputs.videos;
      const voices: VoiceOutput[] | null = inputs.voices;
      // FFmpeg: concat videos, optionally replace audio with voices, add bg music, burn subtitles
      const finalUrl = await concatNode.execute({
        videos,
        voices,
        transition: node.data.config.transition,
        bgMusicUrl: node.data.config.music_url,
        addCaption: node.data.config.add_caption
      });
      return { videoUrl: finalUrl };
    }

    case 'download': {
      return inputs.video.videoUrl;
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}
```

---

## 6. Plugin Implementation Examples

### plugins/script/chatgpt.ts (skeleton)

```typescript
import { ScriptProvider, ScriptInput, ScriptOutput, PluginExecutionContext } from '@veo-farm/shared';

export const ChatGPTScriptPlugin: ScriptProvider = {
  id: 'chatgpt',
  name: 'ChatGPT (web)',
  url: 'https://chatgpt.com',
  loginUrl: 'https://chatgpt.com',

  async generateScript(input: ScriptInput, ctx: PluginExecutionContext): Promise<ScriptOutput> {
    const { page, logger } = ctx;

    await page.goto('https://chatgpt.com', { waitUntil: 'networkidle' });

    // Verify login (look for a logged-in marker)
    if (await page.locator('[data-testid="login-button"]').isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired - cookies invalid, need re-login');
    }

    // Compose full prompt
    const fullPrompt = `${input.systemPrompt}\n\nIDEA: ${input.idea}\n\nReturn ONLY valid JSON matching the ScriptOutput schema.`;

    // Find textarea, paste, submit
    const textarea = page.locator('textarea[data-id="root"]');
    await textarea.fill(fullPrompt);
    await page.keyboard.press('Enter');

    // Wait for response (look for "Stop" button to disappear, or response container to stabilize)
    await page.waitForSelector('[data-testid="stop-button"]', { state: 'detached', timeout: 120_000 });

    // Extract last assistant message
    const responseText = await page.locator('[data-message-author-role="assistant"]').last().innerText();

    // Parse JSON (fenced block or raw)
    const jsonMatch = responseText.match(/```json\s*([\s\S]+?)\s*```/) || [null, responseText];
    const parsed = JSON.parse(jsonMatch[1]);

    return parsed as ScriptOutput;
  }
};

export default ChatGPTScriptPlugin;
```

### plugins/video/veo3.ts (skeleton)

```typescript
import { VideoProvider, VideoInput, VideoOutput, PluginExecutionContext } from '@veo-farm/shared';

export const Veo3Plugin: VideoProvider = {
  id: 'veo3',
  name: 'Veo 3 (Google Flow)',
  url: 'https://labs.google/flow',
  loginUrl: 'https://labs.google/flow',
  capabilities: {
    max_duration_sec: 8,
    supports_image_ref: true,
    supports_voice_in_prompt: true,
    aspect_ratios: ['9:16', '16:9', '1:1']
  },

  async generateVideo(input: VideoInput, ctx: PluginExecutionContext): Promise<VideoOutput> {
    const { page, uploadFile, logger } = ctx;

    await page.goto('https://labs.google/flow/new', { waitUntil: 'networkidle' });

    // Verify login
    if (await page.locator('text=Sign in').isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error('Account expired');
    }

    // If image ref: upload
    if (input.refImageUrl) {
      const imgBuffer = await downloadFromStorage(input.refImageUrl);
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('[data-testid="upload-image-btn"]');  // adjust selector
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({ name: 'ref.jpg', mimeType: 'image/jpeg', buffer: imgBuffer });
      await page.waitForSelector('[data-testid="image-uploaded"]', { timeout: 30_000 });
    }

    // Fill prompt
    const promptArea = page.locator('textarea[placeholder*="prompt"]');
    let fullPrompt = input.prompt;
    if (input.voiceScript) {
      fullPrompt += `\n\nVoiceover: "${input.voiceScript}"`;
    }
    await promptArea.fill(fullPrompt);

    // Set aspect ratio
    await page.click(`[data-aspect="${input.aspectRatio}"]`);

    // Click Generate
    await page.click('[data-testid="generate-btn"]');

    // Wait for video to appear (this is the slow step, 2-5 min)
    await page.waitForSelector('video[src]', { timeout: 10 * 60_000 });

    // Extract video URL or trigger download
    const videoSrc = await page.locator('video').getAttribute('src');
    const buffer = await downloadFromUrl(videoSrc);
    const uploadedUrl = await uploadFile(buffer, 'mp4');

    return {
      videoUrl: uploadedUrl,
      durationSec: 8,
      hasAudio: !!input.voiceScript
    };
  }
};

export default Veo3Plugin;
```

> **NOTE for Claude Code:** The exact selectors above are PLACEHOLDERS. You must inspect the live websites (chatgpt.com, labs.google/flow, etc.) and update selectors to match current DOM. Provide a TODO comment in each plugin for the dev to verify selectors during first run.

---

## 7. Frontend — Canvas + Custom Nodes

### Use React Flow with custom node types

```typescript
// apps/web/components/canvas/FlowCanvas.tsx
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IdeaInputNode } from '../nodes/IdeaInputNode';
import { ScriptWriterNode } from '../nodes/ScriptWriterNode';
// ... import all node types

const nodeTypes = {
  ideaInput: IdeaInputNode,
  scriptWriter: ScriptWriterNode,
  imageGenerator: ImageGeneratorNode,
  videoRender: VideoRenderNode,
  voiceGen: VoiceGenNode,
  concat: ConcatNode,
  download: DownloadNode,
};

export function FlowCanvas({ flowId }: { flowId: string }) {
  // ... fetch flow, manage state with Zustand
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
```

### Custom node mẫu — VideoRenderNode

```typescript
// apps/web/components/nodes/VideoRenderNode.tsx
import { Handle, Position } from '@xyflow/react';
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function VideoRenderNode({ data, selected }) {
  const accountCount = useAccountCount(data.provider);

  return (
    <div className={`rounded-lg border-2 ${selected ? 'border-blue-500' : 'border-gray-300'} bg-white p-4 w-80`}>
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🎬</span>
        <h3 className="font-semibold">Video Render</h3>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <label className="text-gray-600">Provider</label>
          <Select value={data.provider} onValueChange={(v) => updateNode({ provider: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="veo3">Veo 3</SelectItem>
              <SelectItem value="sora" disabled>Sora (Phase 2)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-gray-600">Concurrency: {data.concurrency} / {accountCount}</label>
          <Slider value={[data.concurrency]} max={accountCount} min={1}
            onValueChange={(v) => updateNode({ concurrency: v[0] })}/>
        </div>

        <div className="text-xs text-gray-500">
          {accountCount} accounts available
          <button className="ml-2 text-blue-600" onClick={openAddAccountModal}>+ Add</button>
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

---

## 8. Build Order (Sprint Plan)

### Sprint 0 — Foundation (Day 1-2)

- [ ] Init monorepo with pnpm + turbo
- [ ] Create apps/web (Next.js 14) + apps/worker + packages/shared
- [ ] Setup Supabase project + run all migrations
- [ ] Setup Tailwind + shadcn/ui in web
- [ ] Setup Playwright in worker (Dockerfile)
- [ ] Setup .env.example + encryption key generation
- [ ] Health check endpoints

### Sprint 1 — Auth + Flows CRUD (Day 3-5)

- [ ] Login page (Supabase magic link)
- [ ] List flows page
- [ ] Create new flow (empty graph)
- [ ] Canvas page with React Flow + 7 custom node types (UI only, no logic)
- [ ] Save flow graph to DB on changes (debounced)
- [ ] Default flow template (idea → script → image → video → voice → concat → download)

### Sprint 2 — Account Manager (Day 6-7)

- [ ] Accounts table list page
- [ ] Add account modal (paste cookies JSON)
- [ ] Encryption wrapper (encrypt before save, decrypt in worker)
- [ ] Account status badge component
- [ ] Per-node "Add account" button hooks into modal

### Sprint 3 — Worker Core + First Plugin (Day 8-11)

- [ ] Worker entrypoint with poll loop
- [ ] Job runner skeleton (parse graph, topological sort)
- [ ] Account claim/release with cooldown
- [ ] Plugin registry auto-loader
- [ ] **Plugin: ChatGPT script** (full implementation, manual selector verification)
- [ ] End-to-end: trigger Run from UI → worker picks → ChatGPT executes → result saved
- [ ] Realtime subscription for sub_jobs in UI

### Sprint 4 — Image + Video Plugins (Day 12-15)

- [ ] **Plugin: Flux** (replicate.com web) — image gen
- [ ] **Plugin: DALL-E** (chatgpt.com new image) — image gen
- [ ] **Plugin: Veo 3** (labs.google/flow) — video gen with image ref
- [ ] Fan-out logic in worker (image + video nodes spawn N sub-jobs)
- [ ] Storage upload helpers
- [ ] First successful end-to-end flow: idea → 1 video clip 8s

### Sprint 5 — Voice + Concat + Caption (Day 16-18)

- [ ] **Plugin: Veo native voice** (voice in Veo prompt, no separate plugin call)
- [ ] **Plugin: ElevenLabs** voice gen
- [ ] Concat node (FFmpeg fluent-ffmpeg)
- [ ] Caption node (Whisper local)
- [ ] Music: file upload to media library + bg track in concat
- [ ] First full 60s video end-to-end

### Sprint 6 — UX Polish + Deploy (Day 19-21)

- [ ] Run progress view (tree of sub-jobs with status)
- [ ] Job history page
- [ ] Error retry button per sub-job
- [ ] Add Gemini + Claude script plugins (similar pattern to ChatGPT)
- [ ] Deploy web to Vercel
- [ ] Deploy worker to Railway (Docker)
- [ ] Test prod end-to-end with real accounts

### Post-MVP-1 — see SPEC sections for MVP-2/3/Phase-2 features

---

## 9. Environment Variables

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # worker only

# Encryption (32 bytes hex for AES-256-GCM cookie encryption)
ENCRYPTION_KEY=

# Worker
WORKER_POLL_INTERVAL_MS=3000
WORKER_PLAYWRIGHT_HEADLESS=true   # false for local debug
WORKER_MAX_CONCURRENT_JOBS=1      # MVP-1 = 1, scale by replicas

# Public
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 10. Acceptance Criteria for MVP-1

A successful MVP-1 build means:

1. Hai logs in via magic link.
2. Hai uploads cookies for: 1 ChatGPT, 1 Flux account, 1 Veo 3 account, 1 ElevenLabs (optional).
3. Hai opens default flow with 7 nodes pre-wired.
4. Hai types "Mèo Mochi đi Đà Lạt" in idea node.
5. Hai clicks Run.
6. Within ~15-25 minutes:
   - ChatGPT generates JSON script (visible in run progress).
   - 8 storyboard images render (visible thumbnails).
   - 8 video clips render (visible thumbnails).
   - Voice: either embedded in Veo or generated by ElevenLabs.
   - FFmpeg concats + adds captions.
   - Final 60s MP4 appears in run history.
7. Hai clicks Download → MP4 file 9:16 1080×1920 saved to laptop.
8. Run is logged in `runs` page with all sub-jobs visible.

---

## 11. Notes for Claude Code

- **Selectors WILL be wrong on first run.** Live websites change. Build tool first, then iterate selectors when running first tests with real accounts. Use `page.pause()` for interactive debug.
- **Cookies expire.** Test cookies upload → first plugin run → if 401, surface clear "Account expired, re-upload cookies" UI.
- **Be defensive in plugins** — wrap every Playwright action in try/catch with error context (which selector, which step). Log to sub_jobs.error.
- **Use Zod schemas** in `packages/shared/schemas` to validate plugin outputs before storing.
- **Worker is single-tenant for MVP-1.** Don't worry about user_id in poll (just claim any pending job). Add multi-tenant filtering in MVP-2.
- **Storage URLs** should be signed URLs (Supabase `createSignedUrl`) with TTL ~24h for security.
- **Idempotency:** if worker crashes mid-job, on restart it should mark old `running` jobs older than X minutes as `failed` (or implement heartbeat).

Build this. Ship MVP-1 in ~3 weeks of focused work. Ask Hai to verify each sprint deliverable before moving on.

---

## 12. Testing & Self-healing Roadmap

**Mục tiêu:** Tự động hoá test + tự fix bug để giảm 70-80% effort maintenance. Web automation tools đổi UI thường xuyên — không có testing layer thì plugin gãy mỗi tuần.

### Layer overview

| Layer | Công dụng | Phase | Ưu tiên |
|---|---|---|---|
| L1. CI tests | Catch bug syntax/type/logic trước merge | MVP-1.5 | ⭐ MUST |
| L2. Plugin healthcheck cron | Phát hiện UI tool ngoài đổi sớm 30' | MVP-2 | ⭐ NÊN |
| L3. Self-healing selectors | Plugin tự thử fallback khi selector chính fail | MVP-2 | ⭐ NÊN |
| L4. Auto-debug Claude daemon | Selector chết hoàn toàn → Claude tự đọc DOM, sửa code, commit | Phase 3 | ⚠️ NICE TO HAVE |
| L5. Daily smoke test | Chạy 1 video test mỗi sáng, gửi Telegram | MVP-1.5 | ⭐ NÊN |
| L6. Visual regression | Detect UI change tự động qua diff hình ảnh | Phase 3+ | ⚠️ OPTIONAL |

### L1 — CI tests (MVP-1.5)

**Add files:**

```
veo-farm/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + typecheck + test mỗi PR
│       └── deploy.yml          # auto-deploy when main pushed
├── apps/web/
│   └── __tests__/              # Vitest + RTL
│       ├── components/
│       └── lib/
├── apps/worker/
│   └── __tests__/
│       ├── core/
│       │   ├── job-runner.test.ts
│       │   └── account-pool.test.ts
│       └── plugins/
│           ├── _mocks/         # mock Playwright Page
│           └── *.test.ts       # test mỗi plugin với mock page
└── e2e/
    ├── playwright.config.ts
    └── tests/
        ├── canvas.spec.ts      # drag-drop flow
        ├── account-manager.spec.ts
        └── run-flow.spec.ts    # mock backend, test UI flow
```

**Example .github/workflows/ci.yml:**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:e2e
        env:
          PLAYWRIGHT_BROWSERS_PATH: 0
```

**Plugin unit test pattern (mock Page):**

```typescript
// apps/worker/__tests__/plugins/chatgpt.test.ts
import { test, expect, vi } from 'vitest';
import { ChatGPTScriptPlugin } from '../../src/plugins/script/chatgpt';
import { mockPage } from './_mocks/playwright';

test('ChatGPT plugin extracts JSON from response', async () => {
  const page = mockPage({
    'goto': vi.fn(),
    'locator': (sel: string) => ({
      isVisible: vi.fn().mockResolvedValue(false),
      fill: vi.fn(),
      innerText: vi.fn().mockResolvedValue('```json\n{"character_bible":{...},"scenes":[...]}\n```')
    }),
    'keyboard': { press: vi.fn() },
    'waitForSelector': vi.fn()
  });

  const result = await ChatGPTScriptPlugin.generateScript(
    { idea: 'test', systemPrompt: 'test' },
    { page, account: {} as any, cookies: [], logger: console, abortSignal: new AbortController().signal, uploadFile: vi.fn() }
  );

  expect(result.character_bible).toBeDefined();
  expect(result.scenes).toBeInstanceOf(Array);
});
```

### L2 — Plugin Healthcheck cron (MVP-2)

**Add files:**

```
apps/worker/src/healthcheck/
├── runner.ts              # entrypoint cho cron
├── tests/
│   ├── chatgpt.health.ts  # 1 prompt ngắn
│   ├── flux.health.ts
│   ├── veo3.health.ts
│   └── elevenlabs.health.ts
└── notify.ts              # Telegram alert
```

**Setup:**

- Railway scheduled job: chạy `node dist/healthcheck/runner.js` mỗi 30 phút.
- Mỗi test dùng 1 account riêng (account `healthcheck-only`, ngân sách thấp).
- Pass → update DB `plugin_health` table với status `healthy` + last_checked_at.
- Fail → log chi tiết (screenshot DOM, error stack) + Telegram alert.

**Schema bổ sung:**

```sql
CREATE TABLE public.plugin_health (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plugin_id text NOT NULL UNIQUE,    -- 'chatgpt', 'veo3', ...
  status text NOT NULL,              -- 'healthy', 'degraded', 'down'
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  consecutive_failures int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
```

**UI hiện status trong Account Manager:**

```
🟢 ChatGPT (healthy, 5 min ago)
🟡 Veo 3 (degraded, 2/3 fails last hour)
🔴 ElevenLabs (down, last fail 1h ago)
```

### L3 — Self-healing selectors (MVP-2)

**Pattern:** Mỗi plugin định nghĩa selector dạng array fallback.

```typescript
// apps/worker/src/plugins/_helpers/selector-pool.ts
export class SelectorPool {
  constructor(
    private name: string,
    private selectors: string[],
    private timeoutMs = 2000
  ) {}

  async findFirst(page: Page): Promise<Locator> {
    for (const sel of this.selectors) {
      const locator = page.locator(sel);
      if (await locator.first().isVisible({ timeout: this.timeoutMs }).catch(() => false)) {
        // log selector worked → save to DB for analytics
        await logSelectorHit(this.name, sel);
        return locator.first();
      }
    }
    // All failed → log all + screenshot DOM for L4 daemon
    await logSelectorMiss(this.name, this.selectors, await page.content());
    throw new Error(`SelectorPool '${this.name}': none of ${this.selectors.length} selectors matched`);
  }
}

// Usage in plugin
const generateBtn = new SelectorPool('veo3.generate', [
  'button[data-testid="generate"]',
  'button:has-text("Generate")',
  'button:has-text("Tạo video")',
  '[role="button"][aria-label*="generate" i]',
  'button.generate-btn'
]);

await (await generateBtn.findFirst(page)).click();
```

**DB tracking:**

```sql
CREATE TABLE public.selector_hits (
  id bigserial PRIMARY KEY,
  pool_name text,                    -- 'veo3.generate'
  selector text,                     -- selector worked
  hit_at timestamptz DEFAULT now()
);

CREATE TABLE public.selector_misses (
  id bigserial PRIMARY KEY,
  pool_name text,
  selectors_tried jsonb,
  dom_snapshot text,                 -- truncated to 50KB
  miss_at timestamptz DEFAULT now()
);
```

→ Analytics: cuối tháng query selector nào hay miss → đề xuất xoá / thêm fallback mới.

### L4 — Auto-debug Claude daemon (Phase 3)

**Mục tiêu:** Khi tất cả selector trong pool fail, tự gọi Claude API debug + sửa code + push commit.

**Architecture:**

```
[Worker plugin fail]
    ↓
[selector_misses row inserted]
    ↓
[Daemon polls misses table mỗi 5 phút]
    ↓
[Tìm pool fail ≥3 lần trong 1 giờ]
    ↓
[Gửi prompt vào Claude Code subprocess (anthropic-claude CLI):
  - file plugin code hiện tại
  - DOM snapshot từ misses table
  - error log
  - prompt: "Tìm selector mới đúng cho action X. Edit file Y."
]
    ↓
[Claude Code edit file → git commit "auto-heal: <pool_name>"]
    ↓
[Auto push lên branch auto-heal/<timestamp>]
    ↓
[GitHub Actions chạy CI]
    ↓
[CI pass + integration test pass → auto-merge main → Railway redeploy]
[CI fail → notify Hai review PR]
    ↓
[Telegram notify: "🤖 Plugin <X> self-healed. Commit abc123. Verify khi rảnh."]
```

**Files:**

```
scripts/auto-heal/
├── daemon.ts              # poll loop
├── claude-runner.ts       # spawn Claude Code subprocess
├── pr-creator.ts          # GitHub API tạo PR
└── confidence-gate.ts     # decide auto-merge vs manual review
```

**Confidence gate (quan trọng):**

- Auto-merge nếu: CI pass + integration test pass + healthcheck pass + change <50 lines.
- Manual review (PR notify Hai) nếu: change >50 lines, hoặc fix file ngoài plugin/, hoặc Claude trả về low-confidence reason.

### L5 — Daily Smoke Test (MVP-1.5)

**Setup:** Cron 8h sáng mỗi ngày (Railway scheduled hoặc GitHub Actions schedule).

**Logic:**

```typescript
// scripts/smoke-test.ts
async function runSmokeTest() {
  const flow = await getFlowByName('smoke-test-default');
  const job = await triggerRun(flow.id, { idea: 'Mèo nhảy 5 giây test' });
  await waitForCompletion(job.id, { timeout: 30 * 60_000 });

  if (job.status !== 'completed') {
    await sendTelegram(`❌ Smoke test FAILED: ${job.error}`);
    return;
  }

  const meta = await getVideoMeta(job.output_url);
  const checks = {
    durationOk: meta.duration >= 5,
    hasAudio: meta.hasAudio,
    fileSizeOk: meta.fileSize > 100_000,
    aspectOk: meta.width / meta.height < 0.6  // 9:16
  };

  const passed = Object.values(checks).every(Boolean);
  if (passed) {
    await sendTelegram(`✅ Smoke test 8h done\nVideo: ${job.output_url}`);
  } else {
    await sendTelegram(`⚠️ Smoke test partial fail:\n${JSON.stringify(checks)}\n${job.output_url}`);
  }
}
```

**Output:** mỗi sáng có 1 message Telegram. Hai check trong 30 giây.

### L6 — Visual Regression (Phase 3+)

Optional. Dùng Playwright trace + Percy/Chromatic để diff DOM screenshot mỗi tool.

```bash
pnpm playwright test --update-snapshots  # baseline
pnpm playwright test                      # compare
```

Detect khi `chatgpt.com` đổi UI lớn (ví dụ logo, layout, button position) → pre-empt failure.

---

## 13. Telegram Bot Setup (utility cho L2 + L4 + L5)

```
apps/worker/src/notify/
├── telegram.ts             # send message wrapper
└── templates.ts            # plugin_down, smoke_test_pass, auto_heal_done
```

```typescript
// telegram.ts
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(text: string, opts?: { photo?: Buffer }) {
  const url = opts?.photo
    ? `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`
    : `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  if (opts?.photo) {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('caption', text);
    form.append('photo', new Blob([opts.photo]));
    return fetch(url, { method: 'POST', body: form });
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' })
  });
}
```

Env vars:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 14. Implementation Order (with Testing layers)

**Sprint 0-6:** MVP-1 như section 8.

**Sprint 7 — MVP-1.5 Testing baseline (3-5 ngày):**
- [ ] L1: GitHub Actions CI workflow + Vitest setup + 10-15 unit tests core
- [ ] L1: Plugin mock helpers + 1 integration test mỗi plugin
- [ ] L5: Daily smoke test cron + Telegram bot
- [ ] L1: E2E Playwright test cho UI canvas (drag-drop, save flow)

**Sprint 8 — MVP-2 Robust (3-5 ngày):**
- [ ] L2: Plugin healthcheck cron + plugin_health table + UI status badge
- [ ] L3: SelectorPool helper + refactor 8 plugins dùng pool
- [ ] L3: selector_hits + selector_misses table + analytics page
- [ ] L2: Account expire detection (catch login redirect → mark `expired`)

**Sprint 9-10 — MVP-2 Full features (1-2 tuần):**
- [ ] Multi-flow management
- [ ] Batch CSV upload
- [ ] Per-node concurrency UI

**Sprint 11+ — Phase 3 Autonomous (1+ tuần):**
- [ ] L4: Auto-debug daemon (chạy local trên Mac Hai 24/7)
- [ ] L4: Claude Code subprocess integration
- [ ] L4: GitHub PR auto-create + confidence gate
- [ ] L6: Visual regression (optional)

---

## 15. Reality Check — Cái gì TỰ ĐỘNG được, cái gì KHÔNG

### Tự động ~95%

- Lint, typecheck, syntax error
- Unit test logic
- E2E UI flow

### Tự động ~70-80%

- Selector DOM thay đổi nhẹ → L3 fallback bắt được
- Bug code logic thường → L1 catch + L4 daemon fix
- Plugin output JSON sai schema → L1 validate + L4 sửa system prompt

### Tự động ~30-50%

- Selector DOM đổi lớn (whole layout redesign) → L4 daemon có thể fail, cần Hai review
- Race condition khó reproduce → L1 không catch được, cần manual debug
- Veo render quality drop → L5 detect, không tự fix được

### KHÔNG tự động được — phải Hai can thiệp

- Cookies expire → notify Hai re-upload
- Account die → notify Hai swap/buy mới
- Google/OpenAI/etc. ban toàn bộ pool → notify, đợi cooldown
- Rate limit dài hạn → notify, không bypass được
- Output xấu về creative quality → cần human review (L5 chỉ detect technical fail)
- Pháp lý / TOS issue → notify, không tự xử
- Scope/feature decision → cần Hai quyết định

→ **Realistic: ~70-80% issue tự xử lý, ~20-30% cần Hai trong 5-30 phút/ngày.**

---

## 16. Veo 3 HTTP Plugin — Reverse Flow API (REPLACE Playwright)

**Quyết định 30/4/2026:** Bỏ Playwright cho Veo 3, chuyển sang **HTTP API reverse-engineered** từ `labs.google/flow`. Subscription Gemini Advanced vẫn dùng (auth qua cookies), KHÔNG dùng Vertex API trả phí.

### 16.1 Discovery — Flow internal endpoint

Theo Keysight HAR analysis + useapi.net docs:

```
Host:       https://aisandbox-pa.googleapis.com
Endpoints:  /v1/projects/{projectId}/flowMedia:batchGenerateVideos
            /v1/projects/{projectId}/flowMedia:batchGenerateImages
            /v1/operations/{operationName}            ← polling
Auth:       Bearer OAuth token (auto-refresh qua session cookie)
CAPTCHA:    reCAPTCHA v3 Enterprise required cho generate (NOT polling)
```

Project ID + user ID extract từ session sau khi login `labs.google/flow`.

### 16.2 Architecture — HYBRID Playwright + HTTP

reCAPTCHA v3 Enterprise là blocker → **không thể fetch() thuần**. Solution: dùng Playwright chỉ cho **login + token refresh**, dùng HTTP cho **generate + polling**.

```
[Account ADD lần đầu]
   ↓
[Playwright: login labs.google → solve reCAPTCHA → extract:
     - SAPISID, HSID, SSID cookies
     - Bearer token (từ network log)
     - projectId, userId (từ /v1/users/me hoặc DOM)]
   ↓
[Save vào accounts table: cookies + token + project_id + user_id + token_expires_at]
   ↓
═══════════════════════════════════════════════════
[GENERATE REQUEST — pure HTTP, no Playwright]
   ↓
   POST aisandbox-pa.googleapis.com/v1/projects/{pid}/flowMedia:batchGenerateVideos
   Headers:
     Authorization: Bearer {token}
     Cookie: SAPISID={...}; HSID={...}; SSID={...}
     X-Goog-AuthUser: 0
     Content-Type: application/json
     X-Recaptcha-Token: {token from Playwright cache OR fresh solve}
   Body: {
     prompt: "...",
     referenceImage: "...",
     videoConfig: { durationSec: 8, aspectRatio: "9:16" }
   }
   ← Response: { operationName: "operations/abc123" }
   ↓
[POLL — pure HTTP, no CAPTCHA needed]
   ↓
   GET /v1/operations/abc123
   ← { done: false } → wait 5s, retry
   ← { done: true, response: { videoUrl: "..." } }
   ↓
[Download videoUrl → upload Supabase Storage]
═══════════════════════════════════════════════════
[On 401 / token expired]
   ↓
[Spawn Playwright session refresh token → save → retry HTTP]
```

### 16.3 reCAPTCHA strategy (3 cách)

**Cách A — Pre-cache CAPTCHA token (recommend cho MVP):**
- Playwright lúc login bắt được reCAPTCHA Enterprise token (TTL ~2 phút).
- Generate ngay sau login → token còn valid.
- Mỗi 2 phút spawn Playwright headless ngắn để refresh token.
- Code 1 token/account, dùng cho ~5-10 generate trong 2 phút.

**Cách B — 2captcha / Anti-CAPTCHA service:**
- Cost: ~$2/1000 solve = $0.002/video.
- Pure HTTP, không cần Playwright runtime.
- Setup: API key 2captcha trong env.

**Cách C — Headless CAPTCHA solver (puppeteer-extra + stealth):**
- Browser ngắn để solve reCAPTCHA → extract token.
- Free nhưng có thể bị detect.

→ **MVP dùng Cách A** (re-use Playwright login), Phase 2 thêm Cách B làm fallback.

### 16.4 Plugin file structure

```
apps/worker/src/plugins/video/
├── _interface.ts
├── veo3.ts                     ← OLD Playwright (giữ làm fallback)
├── veo3_http.ts                ← NEW primary, hybrid HTTP
└── _veo3_helpers/
    ├── flow-client.ts          ← HTTP client (fetch + retry)
    ├── auth-extractor.ts       ← Playwright login → extract cookies/token/projectId
    ├── captcha-pool.ts         ← Pre-cached reCAPTCHA tokens
    └── types.ts                ← FlowGenerateRequest, FlowOperation
```

### 16.5 Plugin code (skeleton)

```typescript
// plugins/video/veo3_http.ts
import { VideoProvider, VideoInput, VideoOutput, PluginExecutionContext } from '@veo-farm/shared';
import { FlowClient } from './_veo3_helpers/flow-client';
import { refreshAuth } from './_veo3_helpers/auth-extractor';
import { CaptchaPool } from './_veo3_helpers/captcha-pool';

export const Veo3HttpPlugin: VideoProvider = {
  id: 'veo3_http',
  name: 'Veo 3 (HTTP — reverse Flow API)',
  url: 'https://labs.google/flow',
  loginUrl: 'https://labs.google/flow',
  capabilities: {
    max_duration_sec: 8,
    supports_image_ref: true,
    supports_voice_in_prompt: true,
    aspect_ratios: ['9:16', '16:9', '1:1']
  },

  async generateVideo(input: VideoInput, ctx: PluginExecutionContext): Promise<VideoOutput> {
    const { account, uploadFile, logger } = ctx;
    const auth = JSON.parse(account.meta.auth_blob); // { token, projectId, cookies, expires_at }

    // 1. Refresh if expired
    if (Date.now() > auth.expires_at) {
      logger.info('Token expired, refreshing via Playwright...');
      const newAuth = await refreshAuth(account);
      Object.assign(auth, newAuth);
      await saveAuthToAccount(account.id, newAuth);
    }

    const client = new FlowClient({
      bearerToken: auth.token,
      cookies: auth.cookies,
      projectId: auth.projectId
    });

    // 2. Get reCAPTCHA token (from cache or fresh)
    const captchaToken = await CaptchaPool.getToken(account.id);

    // 3. Upload reference image if any
    let imageRefId: string | undefined;
    if (input.refImageUrl) {
      const buffer = await downloadFromStorage(input.refImageUrl);
      imageRefId = await client.uploadImage(buffer, captchaToken);
    }

    // 4. Submit generate request
    const operation = await client.batchGenerateVideos({
      prompt: input.prompt + (input.voiceScript ? `\n\nVoiceover: "${input.voiceScript}"` : ''),
      referenceImageId: imageRefId,
      durationSec: input.durationSec,
      aspectRatio: input.aspectRatio,
      captchaToken
    });

    // 5. Poll operation (no CAPTCHA needed for polling)
    const result = await client.pollOperation(operation.name, {
      maxWaitMs: 10 * 60_000,
      intervalMs: 5000
    });

    // 6. Download MP4
    const buffer = await client.downloadVideo(result.videoUrl);
    const uploadedUrl = await uploadFile(buffer, 'mp4');

    return {
      videoUrl: uploadedUrl,
      durationSec: result.durationSec,
      hasAudio: result.hasAudio
    };
  }
};

export default Veo3HttpPlugin;
```

### 16.6 Auth extractor (Playwright login flow)

```typescript
// plugins/video/_veo3_helpers/auth-extractor.ts
import { chromium } from 'playwright';

export async function refreshAuth(account: Account): Promise<AuthBlob> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  // Load existing cookies if any
  if (account.cookies_decrypted) {
    await context.addCookies(JSON.parse(account.cookies_decrypted));
  }

  const page = await context.newPage();

  // Intercept network to extract Bearer token + project ID
  let extractedToken: string | null = null;
  let extractedProjectId: string | null = null;
  let extractedCaptcha: string | null = null;

  page.on('request', (req) => {
    const auth = req.headers()['authorization'];
    if (auth?.startsWith('Bearer ') && req.url().includes('aisandbox-pa.googleapis.com')) {
      extractedToken = auth.slice(7);
      const m = req.url().match(/projects\/([^/]+)/);
      if (m) extractedProjectId = m[1];
    }
    const captcha = req.headers()['x-recaptcha-token'];
    if (captcha) extractedCaptcha = captcha;
  });

  await page.goto('https://labs.google/flow/new');

  // If not logged in → wait for user manual login OR auto if cookies valid
  await page.waitForSelector('[data-testid="generate-btn"]', { timeout: 60_000 });

  // Trigger 1 dummy request to capture token (e.g. open project list)
  await page.click('[data-testid="user-menu"]');
  await page.waitForTimeout(2000);

  if (!extractedToken || !extractedProjectId) {
    throw new Error('Failed to extract Flow auth — UI may have changed');
  }

  const cookies = await context.cookies();
  await browser.close();

  return {
    token: extractedToken,
    projectId: extractedProjectId,
    cookies,
    captchaToken: extractedCaptcha,
    expires_at: Date.now() + 30 * 60_000  // 30 min, conservative
  };
}
```

### 16.7 Flow HTTP client

```typescript
// plugins/video/_veo3_helpers/flow-client.ts
const BASE = 'https://aisandbox-pa.googleapis.com/v1';

export class FlowClient {
  constructor(private opts: { bearerToken: string; cookies: Cookie[]; projectId: string }) {}

  private headers(captchaToken?: string) {
    return {
      'Authorization': `Bearer ${this.opts.bearerToken}`,
      'Cookie': this.opts.cookies.map(c => `${c.name}=${c.value}`).join('; '),
      'X-Goog-AuthUser': '0',
      'Content-Type': 'application/json',
      ...(captchaToken && { 'X-Recaptcha-Token': captchaToken })
    };
  }

  async batchGenerateVideos(req: {
    prompt: string;
    referenceImageId?: string;
    durationSec: number;
    aspectRatio: string;
    captchaToken: string;
  }) {
    const url = `${BASE}/projects/${this.opts.projectId}/flowMedia:batchGenerateVideos`;
    const body = {
      prompt: req.prompt,
      ...(req.referenceImageId && { referenceImage: { mediaId: req.referenceImageId } }),
      videoConfig: {
        durationSec: req.durationSec,
        aspectRatio: req.aspectRatio,
        sampleCount: 1
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(req.captchaToken),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) throw new TokenExpiredError(text);
      if (res.status === 403 && text.includes('captcha')) throw new CaptchaError(text);
      throw new Error(`Flow API ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.operations[0]; // { name: "operations/...", done: false }
  }

  async pollOperation(operationName: string, opts: { maxWaitMs: number; intervalMs: number }) {
    const url = `${BASE}/${operationName}`;
    const start = Date.now();
    while (Date.now() - start < opts.maxWaitMs) {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`Poll fail ${res.status}`);
      const op = await res.json();
      if (op.done) {
        if (op.error) throw new Error(op.error.message);
        return {
          videoUrl: op.response.videos[0].videoUri,
          durationSec: op.response.videos[0].durationSec,
          hasAudio: op.response.videos[0].hasAudio ?? true
        };
      }
      await new Promise(r => setTimeout(r, opts.intervalMs));
    }
    throw new Error('Poll timeout');
  }

  async uploadImage(buffer: Buffer, captchaToken: string): Promise<string> {
    // POST /flowMedia:uploadImage with multipart
    // ... return mediaId
  }

  async downloadVideo(videoUri: string): Promise<Buffer> {
    const res = await fetch(videoUri, { headers: this.headers() });
    return Buffer.from(await res.arrayBuffer());
  }
}

class TokenExpiredError extends Error {}
class CaptchaError extends Error {}
```

### 16.8 reCAPTCHA token pool

```typescript
// plugins/video/_veo3_helpers/captcha-pool.ts
const TOKENS = new Map<string, { token: string; expiresAt: number }>();
const TTL_MS = 110_000; // ~2 min, conservative

export class CaptchaPool {
  static async getToken(accountId: string): Promise<string> {
    const cached = TOKENS.get(accountId);
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    // Fresh: spawn headless Playwright briefly to solve reCAPTCHA
    const fresh = await spawnSolver(accountId);
    TOKENS.set(accountId, { token: fresh, expiresAt: Date.now() + TTL_MS });
    return fresh;
  }

  static invalidate(accountId: string) { TOKENS.delete(accountId); }
}

async function spawnSolver(accountId: string): Promise<string> {
  // Headless Playwright open labs.google → wait for grecaptcha.execute → extract token
  // ... (~2-3s)
}
```

### 16.9 Schema migration thêm

```sql
-- migration 0006_flow_auth_blob.sql
ALTER TABLE public.accounts
  ADD COLUMN auth_blob_encrypted text,
  ADD COLUMN auth_expires_at timestamptz;

COMMENT ON COLUMN public.accounts.auth_blob_encrypted IS
  'AES-encrypted JSON: { token, projectId, userId, captchaToken, expires_at } for veo3_http provider';
```

### 16.10 Migration plan từ veo3 (Playwright) → veo3_http

**Sprint 7B (3-5 ngày sau MVP-1 chạy):**

1. Implement `_veo3_helpers/auth-extractor.ts` — Playwright login + extract token. Test với 1 account.
2. Implement `flow-client.ts` — HTTP client. Test gọi `batchGenerateVideos` standalone.
3. Implement `captcha-pool.ts` — token pre-cache.
4. Wire up `veo3_http.ts` plugin. Register in `plugins/registry.ts`.
5. Run schema migration 0006.
6. UI: dropdown video node thêm option "Veo 3 (HTTP)" alongside "Veo 3 (Playwright)".
7. Test 1 video full pipeline với `veo3_http`.
8. Benchmark: HTTP vs Playwright (RAM, latency).
9. Default flow template đổi sang `veo3_http`.

**KHÔNG xoá `veo3.ts` Playwright** — giữ làm fallback khi Flow API rotate.

### 16.11 Risk + mitigation

| Risk | Mức | Mitigation |
|---|---|---|
| Google rotate Flow internal API | Cao | Plugin cũ Playwright fallback. Healthcheck cron 30 phút detect break sớm. |
| reCAPTCHA Enterprise update | Cao | Pre-cache token + 2captcha service backup |
| Token expire giữa generate batch | Trung bình | Auto-refresh qua Playwright spawn ngắn |
| Account ban do hammer endpoint | Trung bình | Cooldown + giới hạn parallel max 3 / account |
| TLS fingerprint detect (HTTP fetch khác browser) | Trung bình | Dùng `undici` với custom TLS hoặc `curl-impersonate-node` |
| Multi-account share project_id | Thấp | Mỗi account có project_id riêng, lưu DB |

### 16.12 Gain expected

- **RAM:** giảm 60-70% (1 Playwright instance ~300MB → 1 fetch call ~5MB)
- **Latency:** giảm 50% (~3-5s overhead Playwright bỏ → HTTP thuần ~500ms)
- **Concurrency:** tăng 5-10x (1 Mac chạy 50 HTTP request parallel mượt vs 5 Playwright)
- **Stability:** tăng (không phụ thuộc DOM selector breakage)
- **Bot detect:** GIỮ NGUYÊN hoặc thấp hơn (vì chạy như extension Google labs)
