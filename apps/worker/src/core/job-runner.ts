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
  /** Subset of nodes the user explicitly asked to (re-)run. Cached
   *  outputs for these are deliberately discarded so the user sees a
   *  fresh result. */
  targetNodeIds?: string[];
  /** UI-supplied snapshot of upstream outputs from a previous run.
   *  Worker pre-loads these into the outputs map so partial runs (▶ on
   *  one node) reuse already-generated images/videos without re-running. */
  cachedOutputs?: Record<string, unknown>;
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
const STUB_GENERATOR_TYPES = new Set(['gemini_prompt', 'gemini_prompt_kie', 'merge_video', 'remove_logo']);
const STUB_PLACEHOLDER_VIDEO =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const STUB_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800';

// Merges each node's generated output (image/video/text) into the saved
// workflow's `graph.nodes[].data` so it survives independently of whichever
// browser session (if any) triggered the run. Best-effort — a workflow that
// was renamed/deleted mid-run, or a job with no workflow_id (ad-hoc/unsaved
// run), just skips silently.
async function syncOutputsToWorkflowGraph(job: Job, outputs: Map<string, unknown>): Promise<void> {
  if (!job.workflow_id) return;
  try {
    const { data: wf } = await supabase()
      .from('workflows')
      .select('graph')
      .eq('id', job.workflow_id)
      .maybeSingle();
    const wfGraph = (wf as { graph?: { nodes?: Array<{ id: string; data?: Record<string, unknown> }> } } | null)
      ?.graph;
    if (!wfGraph?.nodes) return;

    let changed = false;
    const nodes = wfGraph.nodes.map((n) => {
      const out = outputs.get(n.id);
      if (!out || typeof out !== 'object') return n;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = out as any;
      const media = Array.isArray(o.media) && o.media.length > 0
        ? o.media
        : typeof o.image === 'string'
          ? [{ url: o.image, kind: 'image' }]
          : typeof o.video === 'string'
            ? [{ url: o.video, kind: 'video' }]
            : null;
      const text = typeof o.text === 'string' ? o.text : undefined;
      if (!media && text === undefined) return n;
      changed = true;
      return {
        ...n,
        data: {
          ...n.data,
          ...(media ? { previewMedia: media } : {}),
          ...(text !== undefined ? { lastOutputText: text } : {}),
        },
      };
    });
    if (!changed) return;
    await supabase()
      .from('workflows')
      .update({ graph: { ...wfGraph, nodes } })
      .eq('id', job.workflow_id);
  } catch (e) {
    logger.warn({ jobId: job.id, workflowId: job.workflow_id, err: e }, 'runBuilder: failed to sync outputs into workflow graph');
  }
}

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

  // Pre-load UI-supplied cached outputs so partial runs (▶ on a single
  // node) skip re-generation of upstream nodes that already produced
  // images/videos in a previous run. Targets always re-run.
  const cachedOutputs = graph.cachedOutputs ?? {};
  const targetIdSet = new Set(graph.targetNodeIds ?? []);
  const cachedNodeIds = new Set<string>();
  for (const [nodeId, cached] of Object.entries(cachedOutputs)) {
    if (targetIdSet.has(nodeId)) continue; // never reuse cache for an explicit target
    if (cached && typeof cached === 'object') {
      outputs.set(nodeId, cached);
      cachedNodeIds.add(nodeId);
    }
  }

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

  // Nodes that failed, or that got skipped because an upstream node failed.
  // `order` is topological, so by the time we reach a node its upstream
  // nodes have already been processed — checking incoming sources against
  // this set cascades the block down the branch naturally, without needing
  // to precompute descendants. Independent branches (no edge back to a
  // failed node) are untouched and keep running.
  const failedOrBlocked = new Set<string>();
  let hadFailure = false;

  logger.info(
    { jobId: job.id, total, cachedReuseCount: cachedNodeIds.size },
    'runBuilder: start',
  );

  for (const nodeId of order) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    // Cached upstream — skip execution, mark sub_job completed straight away.
    if (cachedNodeIds.has(nodeId)) {
      logger.info({ jobId: job.id, nodeId, type: node.type }, 'runBuilder: reusing cached output');
      const cachedOutput = outputs.get(nodeId) as Record<string, unknown>;
      const { data: subJob } = await supabase()
        .from('sub_jobs')
        .insert({
          job_id: job.id,
          node_id: nodeId,
          node_type: node.type,
          status: 'completed',
          input: node.data?.config ?? {},
          output: cachedOutput,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      void subJob;
      done += 1;
      wait = Math.max(0, total - done - err);
      await supabase().from('jobs').update({ stats: { done, wait, err } }).eq('id', job.id);
      continue;
    }

    // An upstream node on this node's own branch already failed — this node
    // has no valid inputs, so there's no point attempting it. Mark it failed
    // without running, and keep cascading the block to ITS downstream too.
    // Nodes on unrelated branches (no incoming edge from a blocked node)
    // aren't touched and run normally.
    const incoming = incomingByNode.get(nodeId) ?? [];
    const blockedBy = incoming.find((e) => failedOrBlocked.has(e.source));
    if (blockedBy) {
      logger.info(
        { jobId: job.id, nodeId, blockedBy: blockedBy.source },
        'runBuilder: skipping — upstream node failed',
      );
      failedOrBlocked.add(nodeId);
      hadFailure = true;
      await supabase()
        .from('sub_jobs')
        .insert({
          job_id: job.id,
          node_id: nodeId,
          node_type: node.type,
          status: 'failed',
          input: node.data?.config ?? {},
          error: `skipped — upstream node ${blockedBy.source} failed`,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        });
      err += 1;
      wait = Math.max(0, total - done - err);
      await supabase().from('jobs').update({ stats: { done, wait, err } }).eq('id', job.id);
      continue;
    }

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
      // Don't stop the whole run — block only this node's own downstream
      // (cascaded via failedOrBlocked above) and keep going so independent
      // branches still finish. The job is still reported as failed at the
      // end (see hadFailure below) so retry/error UI keeps working.
      failedOrBlocked.add(nodeId);
      hadFailure = true;
    }
  }

  logger.info({ jobId: job.id, done, err }, 'runBuilder: complete');

  // Write every node's generated output back into the saved workflow's own
  // graph — not just sub_jobs. Without this, a run only shows up live in
  // whichever browser session started it (via Realtime + the Canvas store),
  // and the user has to click "Lưu" for it to stick; a run kicked off
  // externally (API key, no browser open) had no session to do that at all,
  // so its results were permanently stranded in sub_jobs even though
  // generation succeeded. Runs on every job tied to a saved workflow,
  // Canvas-triggered or not, and happens even on partial failure so
  // whatever DID succeed is still visible.
  await syncOutputsToWorkflowGraph(job, outputs);

  if (hadFailure) {
    throw new Error(`${err} node(s) failed — see sub_jobs for details`);
  }

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

// Returns the fan-out list of prompts when an upstream prompt_list is wired
// in, or null when there's a single prompt. Each line of prompt_list runs
// the downstream node once.
function resolvePromptList(
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
): string[] | null {
  // Accept textList from any incoming edge — a textList output can only mean
  // "fan-out the downstream node N times". Targeting it to ref-image ports
  // would be a UI mistake we just transparently fix here.
  for (const e of incoming) {
    const up = outputs.get(e.source);
    if (!up || typeof up !== 'object') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = up as any;
    if (Array.isArray(o.textList) && o.textList.length > 0) {
      return o.textList.map((s: unknown) => String(s ?? '').trim()).filter(Boolean);
    }
  }
  return null;
}

// Resolve reference-image URLs wired into a generate_image node's ref-image
// ports (input-1, input-2, ... — dynamic-ports.ts grows these as they get
// connected). Only the first is currently sent (see api-client.ts's
// generateImages — Flow's ogiZ0b payload only carries a single refImageId).
function resolveImageRefUrls(
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
): string[] {
  const urls: string[] = [];
  for (const e of incoming) {
    if (!e.targetHandle || e.targetHandle === 'input-0') continue;
    const up = outputs.get(e.source);
    if (!up || typeof up !== 'object') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = up as any;
    if (typeof o.image === 'string') urls.push(o.image);
    else if (typeof o.imageUrl === 'string') urls.push(o.imageUrl);
    else if (Array.isArray(o.media)) {
      const first = o.media.find((m: { url?: string; kind?: string }) => m?.url && m.kind !== 'video');
      if (first?.url) urls.push(first.url);
    }
  }
  return urls;
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

// Returns the list of Start-Frame images when an upstream generate_image
// (or any node emitting media[]) has more than one. Fan-out runs the
// downstream node once per image with the same prompt.
function resolveStartImageList(
  incoming: Array<{ source: string; targetHandle?: string }>,
  outputs: Map<string, unknown>,
): string[] | null {
  for (const e of incoming) {
    if (e.targetHandle !== 'input-1') continue;
    const up = outputs.get(e.source);
    if (!up || typeof up !== 'object') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = up as any;
    if (Array.isArray(o.media) && o.media.length > 1) {
      const urls = o.media
        .filter((m: { url?: string; kind?: string }) => m?.url && m.kind !== 'video')
        .map((m: { url: string }) => m.url);
      if (urls.length > 1) return urls;
    }
  }
  return null;
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
    // Fan-out: if upstream is a prompt_list, run once per line and merge
    // the resulting media arrays. Single-prompt path is unchanged.
    const promptList = resolvePromptList(incoming, outputs);
    const refImageUrls = resolveImageRefUrls(incoming, outputs);
    if (promptList && promptList.length > 1) {
      const allMedia: Array<Record<string, unknown>> = [];
      for (let i = 0; i < promptList.length; i++) {
        const p = promptList[i];
        logger.info({ index: i + 1, total: promptList.length, prompt: p.slice(0, 60) }, 'generate_image: fan-out');
        const out = await runGenerateImageNode({
          prompt: p,
          config: {
            ratio: cfg.ratio as string | undefined,
            quantity: cfg.quantity as number | undefined,
            quality: cfg.quality as string | undefined,
            imageModel: cfg.imageModel as string | undefined,
          },
          refImageUrls,
          userId: job.user_id,
          jobId: job.id,
        });
        for (const m of out.media) allMedia.push(m as Record<string, unknown>);
      }
      return {
        media: allMedia,
        image: (allMedia[0] as { url?: string })?.url,
      };
    }
    const prompt = resolvePrompt(node, incoming, outputs);
    const out = await runGenerateImageNode({
      prompt,
      config: {
        ratio: cfg.ratio as string | undefined,
        quantity: cfg.quantity as number | undefined,
        quality: cfg.quality as string | undefined,
        imageModel: cfg.imageModel as string | undefined,
        accountId: (cfg.accountId as string | null | undefined) ?? null,
      },
      refImageUrls,
      userId: job.user_id,
      jobId: job.id,
    });
    return { ...out, image: out.media[0]?.url };
  }

  if (node.type === 'generate_video') {
    const { runGenerateVideoNode } = await import('../plugins/builder/generate-video.js');
    const refs = resolveVideoRefs(incoming, outputs, (cfg.videoMode as string) ?? 'FRAME');
    const promptList = resolvePromptList(incoming, outputs);
    const imageList = resolveStartImageList(incoming, outputs);

    // Fan-out across N start-frame images (same prompt, different keyframes).
    // Useful for Setup B: 1 prompt + N images → N videos.
    if ((!promptList || promptList.length <= 1) && imageList && imageList.length > 1) {
      const prompt = resolvePrompt(node, incoming, outputs);
      const allMedia: Array<Record<string, unknown>> = [];
      for (let i = 0; i < imageList.length; i++) {
        logger.info({ index: i + 1, total: imageList.length, image: imageList[i].slice(0, 60) }, 'generate_video: image fan-out');
        const out = await runGenerateVideoNode({
          prompt,
          config: {
            ratio: cfg.ratio as string | undefined,
            quantity: cfg.quantity as number | undefined,
            quality: cfg.quality as string | undefined,
            videoModel: cfg.videoModel as string | undefined,
            videoMode: cfg.videoMode as string | undefined,
            duration: cfg.duration as number | undefined,
            accountId: (cfg.accountId as string | null | undefined) ?? null,
          },
          refs: { ...refs, startImageUrl: imageList[i] },
          userId: job.user_id,
          jobId: job.id,
        });
        for (const m of out.media) allMedia.push(m as Record<string, unknown>);
      }
      return { media: allMedia, video: (allMedia[0] as { url?: string })?.url };
    }

    // Zip fan-out: prompt[i] + image[i] when both lists are present and same length.
    if (promptList && imageList && promptList.length === imageList.length && promptList.length > 1) {
      const allMedia: Array<Record<string, unknown>> = [];
      for (let i = 0; i < promptList.length; i++) {
        logger.info({ index: i + 1, total: promptList.length }, 'generate_video: zip fan-out');
        const out = await runGenerateVideoNode({
          prompt: promptList[i],
          config: {
            ratio: cfg.ratio as string | undefined,
            quantity: cfg.quantity as number | undefined,
            quality: cfg.quality as string | undefined,
            videoModel: cfg.videoModel as string | undefined,
            videoMode: cfg.videoMode as string | undefined,
            duration: cfg.duration as number | undefined,
            accountId: (cfg.accountId as string | null | undefined) ?? null,
          },
          refs: { ...refs, startImageUrl: imageList[i] },
          userId: job.user_id,
          jobId: job.id,
        });
        for (const m of out.media) allMedia.push(m as Record<string, unknown>);
      }
      return { media: allMedia, video: (allMedia[0] as { url?: string })?.url };
    }

    if (promptList && promptList.length > 1) {
      const allMedia: Array<Record<string, unknown>> = [];
      for (let i = 0; i < promptList.length; i++) {
        const p = promptList[i];
        logger.info({ index: i + 1, total: promptList.length, prompt: p.slice(0, 60) }, 'generate_video: fan-out');
        const out = await runGenerateVideoNode({
          prompt: p,
          config: {
            ratio: cfg.ratio as string | undefined,
            quantity: cfg.quantity as number | undefined,
            quality: cfg.quality as string | undefined,
            videoModel: cfg.videoModel as string | undefined,
            videoMode: cfg.videoMode as string | undefined,
            duration: cfg.duration as number | undefined,
            accountId: (cfg.accountId as string | null | undefined) ?? null,
          },
          refs,
          userId: job.user_id,
          jobId: job.id,
        });
        for (const m of out.media) allMedia.push(m as Record<string, unknown>);
      }
      return {
        media: allMedia,
        video: (allMedia[0] as { url?: string })?.url,
      };
    }
    const prompt = resolvePrompt(node, incoming, outputs);
    const out = await runGenerateVideoNode({
      prompt,
      config: {
        ratio: cfg.ratio as string | undefined,
        quantity: cfg.quantity as number | undefined,
        quality: cfg.quality as string | undefined,
        videoModel: cfg.videoModel as string | undefined,
        videoMode: cfg.videoMode as string | undefined,
        duration: cfg.duration as number | undefined,
        accountId: (cfg.accountId as string | null | undefined) ?? null,
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

  if (node.type === 'remove_logo') {
    const { runRemoveLogoNode } = await import('../plugins/builder/remove-logo.js');
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
    const zoom = typeof cfg.zoom === 'number' ? (cfg.zoom as number) : undefined;
    const out = await runRemoveLogoNode({
      videoUrls: urls,
      userId: job.user_id,
      jobId: job.id,
      zoom,
    });
    return { ...out, video: out.media[0]?.url };
  }

  if (node.type === 'extract_last_frame') {
    const { runExtractLastFrameNode } = await import('../plugins/builder/extract-last-frame.js');
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
    const out = await runExtractLastFrameNode({ videoUrls: urls, userId: job.user_id, jobId: job.id });
    return { ...out, image: out.media[0]?.url };
  }

  if (node.type === 'gemini_chat') {
    const { runGeminiChatNode } = await import('../plugins/builder/gemini-chat.js');
    const text = resolvePrompt(node, incoming, outputs);
    const mediaUrls: Array<{ url: string; kind: 'image' | 'video' }> = [];
    for (const e of incoming) {
      if (!e.targetHandle || e.targetHandle === 'input-0') continue;
      const up = outputs.get(e.source);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = up as any;
      if (Array.isArray(o?.media)) {
        for (const m of o.media) {
          if (m?.url) mediaUrls.push({ url: m.url, kind: m.kind === 'video' ? 'video' : 'image' });
        }
      } else if (typeof o?.image === 'string') {
        mediaUrls.push({ url: o.image, kind: 'image' });
      } else if (typeof o?.video === 'string') {
        mediaUrls.push({ url: o.video, kind: 'video' });
      }
    }
    const out = await runGeminiChatNode({
      text,
      mediaUrls,
      config: {
        promptTemplate: cfg.promptTemplate as string | undefined,
        manualOutput: cfg.manualOutput as string | undefined,
        geminiCookies: cfg.geminiCookies as string | undefined,
      },
      userId: job.user_id,
    });
    return { text: out.text };
  }

  if (node.type === 'gemini_vision') {
    const { runGeminiVisionNode } = await import('../plugins/builder/gemini-vision.js');
    const text = resolvePrompt(node, incoming, outputs);
    // Collect every media URL from non-input-0 incoming edges.
    const mediaUrls: Array<{ url: string; kind: 'image' | 'video' }> = [];
    for (const e of incoming) {
      if (!e.targetHandle || e.targetHandle === 'input-0') continue;
      const up = outputs.get(e.source);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = up as any;
      if (Array.isArray(o?.media)) {
        for (const m of o.media) {
          if (m?.url) mediaUrls.push({ url: m.url, kind: m.kind === 'video' ? 'video' : 'image' });
        }
      } else if (typeof o?.image === 'string') {
        mediaUrls.push({ url: o.image, kind: 'image' });
      } else if (typeof o?.video === 'string') {
        mediaUrls.push({ url: o.video, kind: 'video' });
      }
    }
    const out = await runGeminiVisionNode({
      text,
      mediaUrls,
      config: {
        apiKey: cfg.apiKey as string | undefined,
        model: cfg.model as string | undefined,
        promptTemplate: cfg.promptTemplate as string | undefined,
        manualOutput: cfg.manualOutput as string | undefined,
      },
    });
    return { text: out.text };
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
