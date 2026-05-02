// Builder Canvas — gemini_vision node executor.
// Multimodal Gemini call: text prompt + N image/video files. Uses the
// official Gemini Files API (free tier on aistudio.google.com/apikey)
// because reliable >> cookie scraping.
//
// Pipeline:
//   1. Each upstream media URL is downloaded → multipart-uploaded to
//      generativelanguage.googleapis.com/v1beta/files.
//   2. Poll file.state until ACTIVE (Google transcodes video first).
//   3. Call models/{model}:generateContent with parts: [text, fileData...].
//   4. Return concatenated text from candidates[0].

import * as crypto from 'node:crypto';
import { downloadFromUrl } from '../../core/storage.js';
import { logger } from '../../core/logger.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiVisionInput {
  /** Resolved upstream text prompt (from Text/Prompt or Gemini Prompt). */
  text: string;
  /** Image / video URLs from upstream Upload Media / Generate Image. */
  mediaUrls: Array<{ url: string; kind: 'image' | 'video' }>;
  config: {
    apiKey?: string;
    model?: string;
    promptTemplate?: string;
    /** User-edited override — bypasses the API call when present. */
    manualOutput?: string;
  };
}

export interface GeminiVisionOutput {
  text: string;
}

interface UploadedFile {
  uri: string;
  mimeType: string;
  name: string;
}

export async function runGeminiVisionNode(
  input: GeminiVisionInput,
): Promise<GeminiVisionOutput> {
  const override = input.config.manualOutput?.trim();
  if (override) {
    logger.info({ len: override.length }, 'gemini_vision: using manual override');
    return { text: override };
  }

  const apiKey = input.config.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'gemini_vision: API Key chưa cài. Mở editor panel và paste key từ aistudio.google.com/apikey',
    );
  }
  if (!input.mediaUrls || input.mediaUrls.length === 0) {
    throw new Error(
      'gemini_vision: chưa có media input (kết nối Upload Media hoặc Generate Image vào port "media")',
    );
  }

  const model = input.config.model?.trim() || 'gemini-2.5-flash';
  const tmpl = input.config.promptTemplate?.trim() ?? '';
  const upstream = (input.text ?? '').trim();
  let userPrompt: string;
  if (tmpl && tmpl.includes('{{text}}')) {
    userPrompt = tmpl.replace(/\{\{text\}\}/g, upstream);
  } else if (tmpl) {
    userPrompt = upstream ? `${tmpl}\n\n${upstream}` : tmpl;
  } else {
    userPrompt = upstream;
  }
  userPrompt = userPrompt.trim();
  if (!userPrompt) {
    throw new Error('gemini_vision: prompt rỗng (cả template lẫn upstream text đều trống)');
  }

  // 1) Upload each media URL.
  logger.info(
    { count: input.mediaUrls.length, model },
    'gemini_vision: uploading media to Files API',
  );
  const uploaded: UploadedFile[] = [];
  for (const m of input.mediaUrls) {
    const buffer = await downloadFromUrl(m.url);
    const mime = inferMime(m.url, m.kind);
    if (buffer.byteLength > 50 * 1024 * 1024) {
      throw new Error(
        `gemini_vision: file ${m.url.slice(-30)} > 50MB — Files API chỉ nhận ≤50MB, dùng video ngắn hơn`,
      );
    }
    const file = await uploadToFilesApi(apiKey, buffer, mime);
    uploaded.push(file);
  }

  // 2) Wait for ACTIVE state (videos need transcoding, images instant).
  for (const f of uploaded) {
    await waitForActive(apiKey, f.name);
  }

  // 3) Call generateContent.
  const parts: Array<{ text?: string; fileData?: { fileUri: string; mimeType: string } }> = [
    { text: userPrompt },
  ];
  for (const f of uploaded) {
    parts.push({ fileData: { fileUri: f.uri, mimeType: f.mimeType } });
  }

  logger.info({ parts: parts.length, model }, 'gemini_vision: calling generateContent');
  const r = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      }),
    },
  );
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`gemini_vision: API ${r.status}: ${errText.slice(0, 400)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as any;
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '';
  if (!text.trim()) {
    throw new Error(
      `gemini_vision: empty response: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  logger.info({ outLen: text.length }, 'gemini_vision: complete');
  return { text: text.trim() };
}

// ─── Files API helpers ────────────────────────────────────────────────────

async function uploadToFilesApi(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadedFile> {
  // Multipart upload via /upload/v1beta/files?uploadType=multipart — simpler
  // than resumable and works for files ≤50MB which is the API limit anyway.
  const boundary = `-----${crypto.randomBytes(16).toString('hex')}`;
  const meta = JSON.stringify({ file: { displayName: `veo-farm-${Date.now()}` } });
  const head = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      meta +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, buffer, tail]);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.byteLength),
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Files API upload ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  const file = data?.file ?? data;
  if (!file?.uri || !file?.name) {
    throw new Error(`Files API: unexpected upload response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { uri: file.uri, mimeType, name: file.name };
}

async function waitForActive(apiKey: string, fileName: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(
      `${GEMINI_BASE}/${fileName}?key=${encodeURIComponent(apiKey)}`,
    );
    if (!r.ok) {
      throw new Error(`Files API status ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await r.json()) as any;
    const state = data?.state ?? data?.file?.state;
    if (state === 'ACTIVE') return;
    if (state === 'FAILED') throw new Error(`Files API: ${fileName} state=FAILED`);
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error(`Files API: ${fileName} not ACTIVE after ${timeoutMs / 1000}s`);
}

function inferMime(url: string, kind: 'image' | 'video'): string {
  const u = url.toLowerCase();
  if (u.includes('.mp4')) return 'video/mp4';
  if (u.includes('.webm')) return 'video/webm';
  if (u.includes('.mov') || u.includes('.m4v')) return 'video/quicktime';
  if (u.includes('.png')) return 'image/png';
  if (u.includes('.jpg') || u.includes('.jpeg')) return 'image/jpeg';
  if (u.includes('.webp')) return 'image/webp';
  if (u.includes('.gif')) return 'image/gif';
  return kind === 'video' ? 'video/mp4' : 'image/png';
}
