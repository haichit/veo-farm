import { supabase } from './supabase.js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'media';

export async function uploadBuffer(userId: string, jobId: string, buffer: Buffer, ext: string): Promise<string> {
  const path = `${userId}/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType =
    ext === 'mp4' ? 'video/mp4' :
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'png' ? 'image/png' :
    ext === 'mp3' ? 'audio/mpeg' :
    ext === 'wav' ? 'audio/wav' : 'application/octet-stream';

  const { error } = await supabase().storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  // Signed URL with 24h TTL
  const { data, error: signErr } = await supabase().storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (signErr || !data) throw new Error(`signed url failed: ${signErr?.message}`);
  return data.signedUrl;
}

export async function downloadFromUrl(url: string): Promise<Buffer> {
  // data: URLs (Upload Media node stores image inline as base64) — decode
  // locally so downstream Generate Video can re-upload to flow.google.
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    if (commaIdx < 0) throw new Error('downloadFromUrl: malformed data URL');
    const meta = url.slice(5, commaIdx);
    const payload = url.slice(commaIdx + 1);
    const isBase64 = /;base64/i.test(meta);
    return isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
