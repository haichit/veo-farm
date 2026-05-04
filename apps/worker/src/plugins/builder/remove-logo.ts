// Builder Canvas — remove_logo node executor.
// Crops the bottom-right corner (where Veo's watermark sits) by zooming the
// frame from top-left, then scales back to the input resolution using the
// lanczos filter at CRF 17 (visually lossless). Default zoom 1.07 (cuts ~7%
// of the right + bottom edges — enough for Veo's small bottom-right mark).

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getFfmpegPath } from '../../core/ffmpeg-path.js';
import { downloadFromUrl, uploadBuffer } from '../../core/storage.js';
import { logger } from '../../core/logger.js';

export interface RemoveLogoNodeInput {
  videoUrls: string[];
  userId: string;
  jobId: string;
  zoom?: number;
}

export interface RemoveLogoNodeOutput {
  media: Array<{ url: string; kind: 'video' }>;
}

export async function runRemoveLogoNode(
  input: RemoveLogoNodeInput,
): Promise<RemoveLogoNodeOutput> {
  if (!input.videoUrls || input.videoUrls.length === 0) {
    throw new Error('remove_logo: no upstream video connected');
  }
  const zoom = input.zoom && input.zoom > 1 ? input.zoom : 1.07;
  const work = await fs.mkdtemp(path.join(tmpdir(), 'veo-rmlogo-'));
  try {
    const out: Array<{ url: string; kind: 'video' }> = [];
    for (let i = 0; i < input.videoUrls.length; i++) {
      const buf = await downloadFromUrl(input.videoUrls[i]);
      const inFile = path.join(work, `in${i}.mp4`);
      const outFile = path.join(work, `out${i}.mp4`);
      await fs.writeFile(inFile, buf);

      // Probe to get input dimensions so the rescaled output keeps the same
      // resolution (downstream concat with -c copy would otherwise reject
      // mismatched streams).
      const { width, height } = await probeVideo(inFile);
      const filter = `crop=trunc(iw/${zoom}/2)*2:trunc(ih/${zoom}/2)*2:0:0,scale=${width}:${height}:flags=lanczos`;

      await runFfmpeg([
        '-y',
        '-i', inFile,
        '-vf', filter,
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '17',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        outFile,
      ]);

      const cleaned = await fs.readFile(outFile);
      const url = await uploadBuffer(input.userId, input.jobId, cleaned, 'mp4');
      out.push({ url, kind: 'video' });
      logger.info({ idx: i, zoom, width, height }, 'remove_logo: clip done');
    }
    return { media: out };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function probeVideo(file: string): Promise<{ width: number; height: number }> {
  // Use ffmpeg itself (not ffprobe) — we don't bundle ffprobe.
  return new Promise((resolve, reject) => {
    const p = spawn(getFfmpegPath(), ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => (stderr += c.toString()));
    p.on('close', () => {
      const m = stderr.match(/Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/);
      if (!m) return reject(new Error(`probe: cannot parse dimensions: ${stderr.slice(-300)}`));
      resolve({ width: Number(m[1]), height: Number(m[2]) });
    });
  });
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
