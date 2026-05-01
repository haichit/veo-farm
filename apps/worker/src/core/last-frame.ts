// Extract the last frame of a video as a JPEG buffer.
// Used by Video Render's "chain frames" mode: scene N+1 starts from scene N's
// last frame to keep visual continuity.

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function extractLastFrame(videoUrl: string): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'veo-frame-'));
  const inFile = join(dir, 'in.mp4');
  const outFile = join(dir, 'last.jpg');
  try {
    // 1) Download video bytes via curl (avoids undici TLS reject for flow-content.google).
    const buf = await curlDownload(videoUrl);
    writeFileSync(inFile, buf);

    // 2) ffmpeg: seek to ~0.1s before end, grab 1 frame, encode as JPEG.
    await runFfmpeg([
      '-y',
      '-sseof',
      '-0.1',
      '-i',
      inFile,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outFile,
    ]);
    return readFileSync(outFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function curlDownload(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const p = spawn('curl', ['-sSL', '--fail', url]);
    p.stdout.on('data', (c) => chunks.push(c));
    let err = '';
    p.stderr.on('data', (c) => (err += c.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`curl exit ${code}: ${err}`));
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c) => (err += c.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
    });
  });
}
