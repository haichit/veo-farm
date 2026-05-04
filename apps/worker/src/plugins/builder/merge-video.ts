// Builder Canvas — merge_video node executor.
// Concat N input video clips into one mp4 using ffmpeg's concat demuxer
// (re-encode-free when codecs match — Veo3 outputs are all consistent).
// Inputs come from any number of upstream `video` ports; output is a
// single signed Supabase Storage URL.

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getFfmpegPath } from '../../core/ffmpeg-path.js';
import { downloadFromUrl, uploadBuffer } from '../../core/storage.js';
import { logger } from '../../core/logger.js';

export interface MergeVideoNodeInput {
  videoUrls: string[];
  userId: string;
  jobId: string;
}

export interface MergeVideoNodeOutput {
  media: Array<{ url: string; kind: 'video' }>;
}

export async function runMergeVideoNode(
  input: MergeVideoNodeInput,
): Promise<MergeVideoNodeOutput> {
  if (!input.videoUrls || input.videoUrls.length === 0) {
    throw new Error('merge_video: no upstream video clips connected');
  }
  if (input.videoUrls.length === 1) {
    // Single input — pass through unchanged.
    return { media: [{ url: input.videoUrls[0], kind: 'video' }] };
  }

  const work = await fs.mkdtemp(path.join(tmpdir(), 'veo-merge-'));
  try {
    // 1. Download every clip locally.
    const localFiles: string[] = [];
    for (let i = 0; i < input.videoUrls.length; i++) {
      const buf = await downloadFromUrl(input.videoUrls[i]);
      const file = path.join(work, `clip${i}.mp4`);
      await fs.writeFile(file, buf);
      localFiles.push(file);
    }

    // 2. Build a concat list file ffmpeg can chew.
    const listFile = path.join(work, 'list.txt');
    await fs.writeFile(
      listFile,
      localFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    );

    // 3. Concat (stream copy if codecs match — fast, lossless).
    const outFile = path.join(work, 'merged.mp4');
    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outFile,
    ]);

    // 4. Upload to Supabase.
    const buf = await fs.readFile(outFile);
    const url = await uploadBuffer(input.userId, input.jobId, buf, 'mp4');
    logger.info({ count: input.videoUrls.length }, 'merge_video: complete');
    return { media: [{ url, kind: 'video' }] };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(getFfmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c) => (err += c.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
    });
  });
}
