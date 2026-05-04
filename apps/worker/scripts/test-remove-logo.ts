// Smoke test for the remove_logo ffmpeg pipeline (probe + crop + scale).
// Bypasses Supabase upload — reads a local mp4 and writes a cleaned mp4
// next to it.
//
// Usage: tsx scripts/test-remove-logo.ts <input.mp4> [zoom]

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const FF = process.env.FFMPEG_PATH ?? 'ffmpeg';

async function probe(file: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => (stderr += c.toString()));
    p.on('close', () => {
      const m = stderr.match(/Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/);
      if (!m) return reject(new Error(`probe fail: ${stderr.slice(-300)}`));
      resolve({ width: Number(m[1]), height: Number(m[2]) });
    });
  });
}

function runFf(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c) => (err += c.toString()));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`));
    });
  });
}

async function main() {
  const input = process.argv[2];
  const zoom = Number(process.argv[3] ?? 1.15);
  if (!input) {
    console.error('usage: tsx scripts/test-remove-logo.ts <input.mp4> [zoom]');
    process.exit(1);
  }
  await fs.access(input);
  const { width, height } = await probe(input);
  console.log(`input: ${input} ${width}x${height}, zoom=${zoom}`);

  const out = path.join(
    path.dirname(input),
    path.basename(input, path.extname(input)) + `.cleaned.mp4`,
  );
  const filter = `crop=trunc(iw/${zoom}/2)*2:trunc(ih/${zoom}/2)*2:0:0,scale=${width}:${height}:flags=lanczos`;
  console.log(`filter: ${filter}`);
  const t0 = Date.now();
  await runFf([
    '-y',
    '-i', input,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    out,
  ]);
  const ms = Date.now() - t0;
  const sin = (await fs.stat(input)).size;
  const sout = (await fs.stat(out)).size;
  console.log(`✓ ${out}  encode=${ms}ms  size ${(sin / 1e6).toFixed(2)}MB → ${(sout / 1e6).toFixed(2)}MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
