import pLimit from 'p-limit';
import type {
  FlowGraph,
  FlowNode,
  ScriptOutput,
  ImageOutput,
  VideoOutput,
  VoiceOutput,
  PluginExecutionContext,
  Account,
  ProviderKind,
} from '@veo-farm/shared';
import { logger } from './logger.js';
import { supabase } from './supabase.js';
import { topologicalSort, getIncomingNodes } from './graph.js';
import { claimAccount, releaseAccount, decryptCookies, incrementAccountUsage } from './account-pool.js';
import { withPage } from './playwright-pool.js';
import { uploadBuffer } from './storage.js';
import { createSubJob, completeSubJob, failSubJob } from './sub-jobs.js';
import { getPlugin } from '../plugins/registry.js';
import { runConcat } from '../nodes/concat.js';
import { extractLastFrame } from './last-frame.js';

interface Job {
  id: string;
  flow_id: string | null;
  workflow_id?: string | null;
  flow_graph?: BuilderJobGraph | null;
  user_id: string;
  input: { idea?: string } | null;
  parent_job_id?: string | null;
  retry_from_node?: string | null;
}

// Shape stored by /api/run-workflow-builder. Mirrors WorkflowJSON + the
// pre-computed execution order.
interface BuilderJobGraph {
  version: string;
  name?: string;
  nodes: Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }>;
  edges: Array<{ source: string; target: string }>;
  executionOrder?: string[];
}

/**
 * Build a cache of completed sub-job outputs from a parent job, so a retry can
 * skip the work already done. Map: nodeId -> output (single) or array (per scene).
 */
async function buildParentOutputCache(
  parentJobId: string,
): Promise<Map<string, unknown>> {
  const cache = new Map<string, unknown>();
  const { data, error } = await supabase()
    .from('sub_jobs')
    .select('node_id, node_type, input, output, status')
    .eq('job_id', parentJobId)
    .eq('status', 'completed');
  if (error || !data) return cache;

  // Group by node_id. Per-scene plugins (image/video/voice) produce arrays
  // indexed by sceneIdx; single-output plugins (script/concat) produce one value.
  const byNode = new Map<string, typeof data>();
  for (const sj of data) {
    if (!byNode.has(sj.node_id)) byNode.set(sj.node_id, []);
    byNode.get(sj.node_id)!.push(sj);
  }
  for (const [nodeId, subs] of byNode) {
    const sceneIndexed = subs.every((s) => s.input?.sceneIdx !== undefined);
    if (sceneIndexed) {
      const arr: unknown[] = [];
      for (const s of subs) arr[s.input.sceneIdx] = s.output;
      cache.set(nodeId, arr);
    } else {
      // Take latest single output.
      cache.set(nodeId, subs[subs.length - 1].output);
    }
  }
  return cache;
}

export async function runJob(job: Job): Promise<{ outputUrl: string }> {
  logger.info(
    { jobId: job.id, parentJobId: job.parent_job_id, retryFrom: job.retry_from_node },
    'runJob start',
  );

  // ─── Builder Canvas runs (Sprint 10) ──────────────────────────────────
  // These have no flow_id but carry a `flow_graph` snapshot of the new
  // 10-node taxonomy. Real plugin wiring is Sprint 11+; for now we run a
  // stub that drives sub_jobs through pending → running → completed so the
  // UI/Realtime path can be exercised end-to-end.
  if (!job.flow_id && job.flow_graph) {
    return runBuilderStub(job);
  }

  if (!job.flow_id) {
    throw new Error('Job has no flow_id and no flow_graph — nothing to execute');
  }

  const { data: flow, error } = await supabase().from('flows').select('graph').eq('id', job.flow_id).single();
  if (error || !flow) throw new Error(`Cannot load flow: ${error?.message}`);
  const graph = flow.graph as FlowGraph;

  const order = topologicalSort(graph);
  const outputs = new Map<string, unknown>();

  // If this is a retry, prime outputs from the parent job's completed sub-jobs
  // so nodes before retry_from_node are skipped.
  let cachedNodes = new Set<string>();
  if (job.parent_job_id && job.retry_from_node) {
    const cache = await buildParentOutputCache(job.parent_job_id);
    const retryIdx = order.findIndex((n) => n.id === job.retry_from_node);
    if (retryIdx >= 0) {
      for (let i = 0; i < retryIdx; i++) {
        const n = order[i];
        if (cache.has(n.id)) {
          outputs.set(n.id, cache.get(n.id));
          cachedNodes.add(n.id);
        }
      }
      logger.info(
        { skipped: cachedNodes.size, resumeFrom: job.retry_from_node },
        'runJob: resuming from cached parent outputs',
      );
    }
  }

  for (const node of order) {
    if (cachedNodes.has(node.id)) {
      logger.info({ nodeId: node.id, type: node.type }, 'skipping (cached from parent)');
      continue;
    }
    logger.info({ nodeId: node.id, type: node.type }, 'executing node');
    const inputs = collectInputs(node, graph, outputs);
    const out = await executeNode(node, inputs, job, graph);
    outputs.set(node.id, out);
  }

  const downloadNode = graph.nodes.find((n) => n.type === 'download');
  if (!downloadNode) throw new Error('No download node in flow');
  const finalUrl = outputs.get(downloadNode.id) as string;
  if (!finalUrl) throw new Error('Download node produced no output');
  return { outputUrl: finalUrl };
}

function collectInputs(node: FlowNode, graph: FlowGraph, outputs: Map<string, unknown>): Record<string, unknown> {
  const incoming = getIncomingNodes(node.id, graph);
  const result: Record<string, unknown> = {};
  for (const src of incoming) {
    // Map upstream output by upstream's node type, e.g. scriptWriter -> "script"
    const key = typeKey(src.type);
    result[key] = outputs.get(src.id);
  }
  return result;
}

function parseConcurrency(v: unknown, def = 1): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return Math.floor(v);
  if (typeof v === 'string') {
    if (v === 'auto') return def;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return def;
}

function typeKey(type: string): string {
  switch (type) {
    case 'ideaInput':
      return 'idea';
    case 'scriptWriter':
      return 'script';
    case 'imageGenerator':
      return 'images';
    case 'videoRender':
      return 'videos';
    case 'voiceGen':
      return 'voices';
    case 'concat':
      return 'video';
    default:
      return type;
  }
}

async function buildContext(
  account: Account,
  page: any,
  job: Job,
): Promise<PluginExecutionContext> {
  const cookies = decryptCookies(account);
  return {
    page,
    account,
    cookies,
    logger: {
      info: (m, meta) => logger.info({ ...meta, plugin: account.provider_id }, m),
      warn: (m, meta) => logger.warn({ ...meta, plugin: account.provider_id }, m),
      error: (m, meta) => logger.error({ ...meta, plugin: account.provider_id }, m),
      debug: (m, meta) => logger.debug({ ...meta, plugin: account.provider_id }, m),
    },
    abortSignal: new AbortController().signal,
    uploadFile: (buf, ext) => uploadBuffer(job.user_id, job.id, buf, ext),
  };
}

// Plugins that manage their own browser (puppeteer + persistent profile).
// withProvider skips playwright-pool for these so the userDataDir isn't double-locked.
const STANDALONE_BROWSER_PROVIDERS = new Set(['veo3', 'veo3_flow_v2']);

// Plugin kinds whose successful invocations count toward daily quota.
const QUOTA_TRACKED_KINDS = new Set<ProviderKind>(['video', 'image']);

async function withProvider<T>(
  kind: ProviderKind,
  providerId: string,
  job: Job,
  cooldownSec: number,
  fn: (plugin: any, ctx: PluginExecutionContext) => Promise<T>,
): Promise<{ result: T; accountId: string }> {
  const plugin = getPlugin(kind, providerId);
  const account = await claimAccount(job.user_id, providerId);
  try {
    const cookies = decryptCookies(account);
    let result: T;
    if (STANDALONE_BROWSER_PROVIDERS.has(providerId)) {
      const ctx = await buildContext(account, null, job);
      result = await fn(plugin, ctx);
    } else {
      result = await withPage(account, cookies, async (page) => {
        const ctx = await buildContext(account, page, job);
        return await fn(plugin, ctx);
      });
    }
    await releaseAccount(account.id, cooldownSec, 'idle');
    if (QUOTA_TRACKED_KINDS.has(kind)) {
      await incrementAccountUsage(account.id);
    }
    return { result, accountId: account.id };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const expired = msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('login');
    await releaseAccount(account.id, 0, expired ? 'expired' : 'idle', msg);
    throw err;
  }
}

async function executeNode(node: FlowNode, inputs: Record<string, unknown>, job: Job, _graph: FlowGraph): Promise<unknown> {
  switch (node.type) {
    case 'ideaInput': {
      return (node.data?.value as string) || job.input?.idea || '';
    }

    case 'scriptWriter': {
      const providerId = (node.data?.provider as string) ?? 'chatgpt';
      const idea = (inputs.idea as string) ?? '';
      const systemPrompt = ((node.data?.config as any)?.system_prompt as string) ?? '';
      const subId = await createSubJob(job.id, node.id, 'script', providerId, { idea });
      try {
        const { result, accountId } = await withProvider('script', providerId, job, 30, (plugin, ctx) =>
          plugin.generateScript({ idea, systemPrompt }, ctx),
        );
        await completeSubJob(subId, result, accountId);
        return result;
      } catch (err: any) {
        await failSubJob(subId, String(err?.message ?? err));
        throw err;
      }
    }

    case 'imageGenerator': {
      const providerId = (node.data?.provider as string) ?? 'flux';
      const script = inputs.script as ScriptOutput;
      if (!script?.scenes) throw new Error('imageGenerator: missing script input');
      const concurrency = parseConcurrency(node.data?.concurrency);

      const outs: ImageOutput[] = new Array(script.scenes.length);

      // Scene 0 first (sync) to use as ref for the rest
      const sub0 = await createSubJob(job.id, node.id, 'image', providerId, { sceneIdx: 0 });
      try {
        const { result, accountId } = await withProvider<ImageOutput>('image', providerId, job, 30, (plugin, ctx) =>
          plugin.generateImage({ prompt: script.scenes[0].image_prompt, aspectRatio: '9:16' }, ctx),
        );
        outs[0] = result;
        await completeSubJob(sub0, result, accountId);
      } catch (err: any) {
        await failSubJob(sub0, String(err?.message ?? err));
        throw err;
      }

      // Remaining scenes parallel with ref image
      const limit = pLimit(Math.max(1, concurrency));
      await Promise.all(
        script.scenes.slice(1).map((scene, i) =>
          limit(async () => {
            const sceneIdx = i + 1;
            const subId = await createSubJob(job.id, node.id, 'image', providerId, { sceneIdx });
            try {
              const { result, accountId } = await withProvider<ImageOutput>('image', providerId, job, 30, (plugin, ctx) =>
                plugin.generateImage(
                  { prompt: scene.image_prompt, refImageUrl: outs[0].imageUrl, aspectRatio: '9:16' },
                  ctx,
                ),
              );
              outs[sceneIdx] = result;
              await completeSubJob(subId, result, accountId);
            } catch (err: any) {
              await failSubJob(subId, String(err?.message ?? err));
              throw err;
            }
          }),
        ),
      );
      return outs;
    }

    case 'videoRender': {
      const providerId = (node.data?.provider as string) ?? 'veo3';
      const script = inputs.script as ScriptOutput;
      const images = (inputs.images as ImageOutput[] | undefined) ?? [];
      const concurrency = parseConcurrency(node.data?.concurrency);
      const chainFrames = node.data?.chainFrames === true;
      if (!script?.scenes) throw new Error('videoRender: missing script input');

      const results: VideoOutput[] = [];

      if (chainFrames) {
        // Serial loop: each scene's last frame becomes the next scene's startImage.
        // Concurrency is forced to 1 (chaining requires order).
        let prevVideoUrl: string | null = null;
        for (let i = 0; i < script.scenes.length; i++) {
          const scene = script.scenes[i];
          const subId = await createSubJob(job.id, node.id, 'video', providerId, { sceneIdx: i });
          try {
            let startImageUrl: string | undefined;
            if (prevVideoUrl) {
              logger.info({ sceneIdx: i, prevVideoUrl }, 'chainFrames: extracting last frame');
              const frame = await extractLastFrame(prevVideoUrl);
              const frameUrl = await uploadBuffer(job.user_id, job.id, frame, 'jpg');
              startImageUrl = frameUrl;
            }
            const { result, accountId } = await withProvider<VideoOutput>('video', providerId, job, 5, (plugin, ctx) =>
              plugin.generateVideo(
                {
                  prompt: scene.video_prompt,
                  refImageUrl: i === 0 ? images[i]?.imageUrl : undefined,
                  startImageUrl,
                  voiceScript: scene.voice_script,
                  durationSec: scene.duration_sec,
                  aspectRatio: '9:16',
                },
                ctx,
              ),
            );
            results[i] = result;
            prevVideoUrl = result.videoUrl;
            await completeSubJob(subId, result, accountId);
          } catch (err: any) {
            await failSubJob(subId, String(err?.message ?? err));
            throw err;
          }
        }
        return results;
      }

      // Default: parallel via pLimit (each scene independent, no frame chain).
      const limit = pLimit(Math.max(1, concurrency));
      await Promise.all(
        script.scenes.map((scene, i) =>
          limit(async () => {
            const subId = await createSubJob(job.id, node.id, 'video', providerId, { sceneIdx: i });
            try {
              const { result, accountId } = await withProvider<VideoOutput>('video', providerId, job, 5, (plugin, ctx) =>
                plugin.generateVideo(
                  {
                    prompt: scene.video_prompt,
                    refImageUrl: images[i]?.imageUrl,
                    voiceScript: scene.voice_script,
                    durationSec: scene.duration_sec,
                    aspectRatio: '9:16',
                  },
                  ctx,
                ),
              );
              results[i] = result;
              await completeSubJob(subId, result, accountId);
            } catch (err: any) {
              await failSubJob(subId, String(err?.message ?? err));
              throw err;
            }
          }),
        ),
      );
      return results;
    }

    case 'voiceGen': {
      const providerId = (node.data?.provider as string) ?? 'veo_native';
      if (providerId === 'veo_native') return null; // skip — voice embedded in Veo
      const script = inputs.script as ScriptOutput;
      if (!script?.scenes) throw new Error('voiceGen: missing script input');
      const voiceId = ((node.data?.config as any)?.voice_id as string) ?? 'default';
      const concurrency = parseConcurrency(node.data?.concurrency, 1);

      const limit = pLimit(concurrency);
      const results: VoiceOutput[] = [];
      await Promise.all(
        script.scenes.map((scene, i) =>
          limit(async () => {
            const subId = await createSubJob(job.id, node.id, 'voice', providerId, { sceneIdx: i });
            try {
              const { result, accountId } = await withProvider<VoiceOutput>('voice', providerId, job, 15, (plugin, ctx) =>
                plugin.generateVoice({ text: scene.voice_script, voiceId, language: 'vi' }, ctx),
              );
              results[i] = result;
              await completeSubJob(subId, result, accountId);
            } catch (err: any) {
              await failSubJob(subId, String(err?.message ?? err));
              throw err;
            }
          }),
        ),
      );
      return results;
    }

    case 'concat': {
      const videos = inputs.videos as VideoOutput[];
      const voices = inputs.voices as VoiceOutput[] | null | undefined;
      if (!videos?.length) throw new Error('concat: no videos');
      const config = (node.data?.config as any) ?? {};
      const subId = await createSubJob(job.id, node.id, 'concat', null, { videoCount: videos.length });
      try {
        const finalUrl = await runConcat({
          userId: job.user_id,
          jobId: job.id,
          videos,
          voices: voices ?? null,
          transition: config.transition ?? 'fade',
          bgMusicUrl: config.music_url ?? null,
          addCaption: !!config.add_caption,
        });
        const out = { videoUrl: finalUrl };
        await completeSubJob(subId, out);
        return out;
      } catch (err: any) {
        await failSubJob(subId, String(err?.message ?? err));
        throw err;
      }
    }

    case 'download': {
      const v = inputs.video as { videoUrl: string };
      if (!v?.videoUrl) throw new Error('download: no input video');
      return v.videoUrl;
    }

    default:
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

// ─── Sprint 10 Builder stub ─────────────────────────────────────────────
// Drives sub_jobs and the parent jobs.stats counter so the Builder UI can be
// exercised end-to-end before real plugin wiring lands. Generator nodes emit
// a placeholder sample-video URL so the Album/preview overlays render.
// Node types that still fall back to a placeholder (real plugin wiring TBD).
// generate_image + generate_video have real plugins now and short-circuit
// before the stub branch in executeBuilderNode.
const STUB_GENERATOR_TYPES = new Set(['gemini_prompt', 'gemini_prompt_kie', 'merge_video']);
const STUB_PLACEHOLDER_VIDEO =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const STUB_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800';

async function runBuilderStub(job: Job): Promise<{ outputUrl: string }> {
  const graph = job.flow_graph!;
  const order = graph.executionOrder ?? graph.nodes.map((n) => n.id);
  const total = order.length;
  let done = 0;
  let err = 0;
  let wait = total;

  // Per-node outputs so a downstream node (e.g. generate_image) can resolve
  // its inputs from upstream Text/Prompt nodes.
  const outputs = new Map<string, unknown>();

  // Reverse adjacency — for each node, which upstream nodes feed which input.
  const incomingByNode = new Map<string, Array<{ source: string; targetHandle?: string }>>();
  for (const e of graph.edges) {
    if (!incomingByNode.has(e.target)) incomingByNode.set(e.target, []);
    incomingByNode.get(e.target)!.push({
      source: e.source,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetHandle: (e as any).targetHandle,
    });
  }

  logger.info({ jobId: job.id, total }, 'runBuilder: start');

  for (const nodeId of order) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    // Honour pause/cancel before each step.
    const { data: cur } = await supabase()
      .from('jobs')
      .select('status')
      .eq('id', job.id)
      .single();
    while (cur && (cur as any).status === 'paused') {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: again } = await supabase().from('jobs').select('status').eq('id', job.id).single();
      if (!again || (again as any).status !== 'paused') break;
    }
    if (cur && (cur as any).status === 'cancelled') {
      logger.info({ jobId: job.id }, 'runBuilder: cancelled');
      throw new Error('cancelled by user');
    }

    const { data: subJob } = await supabase()
      .from('sub_jobs')
      .insert({
        job_id: job.id,
        node_id: nodeId,
        node_type: node.type,
        status: 'running',
        input: node.data?.config ?? {},
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    let output: Record<string, unknown> = {};
    let nodeFailed = false;
    let nodeError: string | undefined;

    try {
      output = await executeBuilderNode(node, incomingByNode.get(nodeId) ?? [], outputs, job);
    } catch (e) {
      nodeFailed = true;
      nodeError = (e as Error)?.message ?? String(e);
      logger.error({ jobId: job.id, nodeId, err: nodeError }, 'runBuilder: node failed');
    }

    outputs.set(nodeId, output);

    if (subJob) {
      await supabase()
        .from('sub_jobs')
        .update({
          status: nodeFailed ? 'failed' : 'completed',
          output: nodeFailed ? null : output,
          error: nodeError ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', (subJob as any).id);
    }

    if (nodeFailed) err += 1;
    else done += 1;
    wait = Math.max(0, total - done - err);
    await supabase()
      .from('jobs')
      .update({ stats: { done, wait, err } })
      .eq('id', job.id);

    if (nodeFailed) {
      // Stop the run on first hard failure — downstream nodes have no inputs.
      throw new Error(`node ${nodeId} (${node.type}) failed: ${nodeError}`);
    }
  }

  logger.info({ jobId: job.id, done }, 'runBuilder: complete');
  // Best-effort terminal output url — first downloadable media we produced.
  for (const v of outputs.values()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (v as any)?.media;
    if (Array.isArray(m) && m[0]?.url) return { outputUrl: m[0].url as string };
  }
  return { outputUrl: STUB_PLACEHOLDER_VIDEO };
}

// Resolve the prompt text for a generate_image / generate_video / gemini_*
// node by walking incoming edges and pulling text from upstream outputs or
// the node's own config fallback.
function resolvePrompt(
  node: { id: string; type: string; data?: { config?: Record<string, unknown> } },
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
): string {
  // Port 0 (input-0) carries the primary text/prompt.
  for (const e of incoming) {
    if (e.targetHandle && e.targetHandle !== 'input-0') continue;
    const up = outputs.get(e.source);
    if (!up) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = up as any;
    if (typeof o.text === 'string' && o.text.trim()) return o.text;
    if (typeof o.prompt === 'string' && o.prompt.trim()) return o.prompt;
  }
  const cfg = (node.data?.config ?? {}) as { text?: string; prompt?: string };
  return cfg.text ?? cfg.prompt ?? '';
}

// Resolve image inputs for a generate_video node. Port indexes follow
// dynamic-ports.ts:
//   FRAME mode → input-1 = Start Frame, input-2 = End Frame
//   REF mode   → input-1..N = ref images
function resolveVideoRefs(
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
  mode: string,
): { startImageUrl?: string; endImageUrl?: string; referenceImageUrls?: string[] } {
  function urlFromOutput(out: unknown): string | undefined {
    if (!out || typeof out !== 'object') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = out as any;
    if (typeof o.image === 'string') return o.image;
    if (typeof o.imageUrl === 'string') return o.imageUrl;
    if (Array.isArray(o.media)) {
      const first = o.media.find(
        (m: { url?: string; kind?: string }) => m?.url && m.kind !== 'video',
      );
      if (first?.url) return first.url;
    }
    return undefined;
  }

  if (mode.toUpperCase() === 'REF') {
    const urls: string[] = [];
    for (const e of incoming) {
      if (!e.targetHandle || e.targetHandle === 'input-0') continue;
      const u = urlFromOutput(outputs.get(e.source));
      if (u) urls.push(u);
    }
    return { referenceImageUrls: urls };
  }

  // FRAME mode (default)
  let startImageUrl: string | undefined;
  let endImageUrl: string | undefined;
  for (const e of incoming) {
    if (e.targetHandle === 'input-1') startImageUrl = urlFromOutput(outputs.get(e.source));
    else if (e.targetHandle === 'input-2') endImageUrl = urlFromOutput(outputs.get(e.source));
  }
  return { startImageUrl, endImageUrl };
}

async function executeBuilderNode(
  node: { id: string; type: string; data?: { config?: Record<string, unknown> } },
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
  job: Job,
): Promise<Record<string, unknown>> {
  const cfg = (node.data?.config ?? {}) as Record<string, unknown>;

  if (node.type === 'prompt' || node.type === 'prompt_list') {
    // Pass-through nodes — just emit their text.
    const text = resolvePrompt(node, incoming, outputs) || (cfg.text as string) || '';
    return node.type === 'prompt_list'
      ? { textList: text.split('\n').filter((l) => l.trim().length > 0), text }
      : { text };
  }

  if (node.type === 'generate_image') {
    const { runGenerateImageNode } = await import('../plugins/builder/generate-image.js');
    const prompt = resolvePrompt(node, incoming, outputs);
    const out = await runGenerateImageNode({
      prompt,
      config: {
        ratio: cfg.ratio as string | undefined,
        quantity: cfg.quantity as number | undefined,
        quality: cfg.quality as string | undefined,
        imageModel: cfg.imageModel as string | undefined,
      },
      userId: job.user_id,
      jobId: job.id,
    });
    return { ...out, image: out.media[0]?.url };
  }

  if (node.type === 'generate_video') {
    const { runGenerateVideoNode } = await import('../plugins/builder/generate-video.js');
    const prompt = resolvePrompt(node, incoming, outputs);
    const refs = resolveVideoRefs(incoming, outputs, (cfg.videoMode as string) ?? 'FRAME');
    const out = await runGenerateVideoNode({
      prompt,
      config: {
        ratio: cfg.ratio as string | undefined,
        quantity: cfg.quantity as number | undefined,
        quality: cfg.quality as string | undefined,
        videoModel: cfg.videoModel as string | undefined,
        videoMode: cfg.videoMode as string | undefined,
        duration: cfg.duration as number | undefined,
      },
      refs,
      userId: job.user_id,
      jobId: job.id,
    });
    return { ...out, video: out.media[0]?.url };
  }

  if (node.type === 'download') {
    // Pass-through — collect upstream media into a flat list.
    const collected: Array<{ url: string; kind: string }> = [];
    for (const e of incoming) {
      const up = outputs.get(e.source);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (up as any)?.media;
      if (Array.isArray(m)) collected.push(...m);
    }
    return { media: collected };
  }

  if (node.type === 'merge_video') {
    const { runMergeVideoNode } = await import('../plugins/builder/merge-video.js');
    const urls: string[] = [];
    for (const e of incoming) {
      const up = outputs.get(e.source);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (up as any)?.media;
      if (Array.isArray(m)) {
        for (const item of m) {
          if (item?.url && item.kind === 'video') urls.push(item.url);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (up as any)?.video;
      if (typeof v === 'string' && !urls.includes(v)) urls.push(v);
    }
    const out = await runMergeVideoNode({ videoUrls: urls, userId: job.user_id, jobId: job.id });
    return { ...out, video: out.media[0]?.url };
  }

  if (node.type === 'gemini_prompt' || node.type === 'gemini_prompt_kie') {
    const { runGeminiPromptNode } = await import('../plugins/builder/gemini-prompt.js');
    const text = resolvePrompt(node, incoming, outputs);
    const out = await runGeminiPromptNode({
      text,
      config: {
        apiKey: cfg.apiKey as string | undefined,
        model: cfg.model as string | undefined,
        promptTemplate: cfg.promptTemplate as string | undefined,
        useAdditionalText: cfg.useAdditionalText as boolean | undefined,
        additionalText: cfg.additionalText as string | undefined,
        manualOutput: cfg.manualOutput as string | undefined,
      },
    });
    return { text: out.text };
  }

  if (node.type === 'upload_image') {
    // UI lưu data URL trong config.imageUrl khi user click upload trên node.
    // Worker pass-through: emit URL/data URL thẳng để downstream node dùng.
    // Generate Video sẽ download (hỗ trợ data URL qua downloadFromUrl) rồi
    // re-upload lên flow.google.
    const url = (cfg.imageUrl as string) ?? (cfg.imagePath as string) ?? '';
    if (!url) throw new Error('upload_image: chưa chọn file nào trong node');
    return {
      media: [{ url, kind: 'image' }],
      image: url,
      imageUrl: url,
    };
  }

  if (node.type === 'frame') {
    // Visual grouping only — emits nothing. Children nodes execute on their own.
    return { ok: true };
  }

  // Unknown type — log + return ok so the run doesn't hard-fail on a typo.
  logger.warn({ type: node.type }, 'executeBuilderNode: unknown node type, returning ok');
  return { ok: true };
}

function buildStubOutput(type: string): Record<string, unknown> {
  if (type === 'generate_video' || type === 'merge_video') {
    return { media: [{ url: STUB_PLACEHOLDER_VIDEO, kind: 'video' }] };
  }
  if (type === 'generate_image') {
    return { media: [{ url: STUB_PLACEHOLDER_IMAGE, kind: 'image' }] };
  }
  return { text: 'Stub output — Sprint 10 builder execution pending.' };
}
