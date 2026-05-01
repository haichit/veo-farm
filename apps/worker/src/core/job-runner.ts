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
import { claimAccount, releaseAccount, decryptCookies } from './account-pool.js';
import { withPage } from './playwright-pool.js';
import { uploadBuffer } from './storage.js';
import { createSubJob, completeSubJob, failSubJob } from './sub-jobs.js';
import { getPlugin } from '../plugins/registry.js';
import { runConcat } from '../nodes/concat.js';

interface Job {
  id: string;
  flow_id: string;
  user_id: string;
  input: { idea?: string } | null;
}

export async function runJob(job: Job): Promise<{ outputUrl: string }> {
  logger.info({ jobId: job.id }, 'runJob start');

  const { data: flow, error } = await supabase().from('flows').select('graph').eq('id', job.flow_id).single();
  if (error || !flow) throw new Error(`Cannot load flow: ${error?.message}`);
  const graph = flow.graph as FlowGraph;

  const order = topologicalSort(graph);
  const outputs = new Map<string, unknown>();

  for (const node of order) {
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
      if (!script?.scenes) throw new Error('videoRender: missing script input');

      const limit = pLimit(Math.max(1, concurrency));
      const results: VideoOutput[] = [];
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
