// Downloads a (usually cross-origin Supabase Storage) media URL as a real
// file, with a proper save-location prompt in the desktop app.
//
// A plain `<a href={remoteUrl} download>` doesn't work here: the `download`
// attribute is only honoured by browsers for same-origin resources (or
// cross-origin ones the server explicitly marks downloadable via CORS +
// Content-Disposition) — Supabase's signed URLs serve inline, so browsers
// silently ignore `download` and just navigate/open the URL instead. That
// also means Electron's `will-download` save-dialog hook never fires, since
// no download ever actually starts.
//
// Fetching the bytes ourselves and downloading a same-origin `blob:` URL
// sidesteps both problems — `download` always applies to blob: URLs, and it
// registers as a real download Electron's session can intercept.
// Best-effort filename: reuse the storage path's own name when the URL has
// one, otherwise fall back to a generic name keyed off the node/index.
export function inferMediaFilename(
  url: string,
  kind: 'image' | 'video',
  fallbackKey: string | number,
): string {
  const ext = kind === 'video' ? 'mp4' : 'png';
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').pop();
    if (last && last.includes('.')) return last;
  } catch {
    /* not a URL — data: or relative */
  }
  return `veo-farm-${kind}-${fallbackKey}.${ext}`;
}

// "Tải tất cả" for a whole canvas or a single frame: downloading N files via
// N native Save dialogs would be miserable, so in the desktop app this asks
// for a destination FOLDER once (main process handles the fetch + write —
// see vf:bulk-download in apps/desktop/src/main.ts) and drops every file
// straight in. Falls back to one-by-one blob downloads (still one Save
// dialog per file) if the desktop bridge isn't present, e.g. running this
// page in a plain browser tab.
export async function bulkDownloadMedia(
  items: Array<{ url: string; kind: 'image' | 'video'; key: string | number }>,
): Promise<{ ok: boolean; reason?: string; dir?: string; saved?: number; failed?: number }> {
  const files = items.map((it) => ({
    url: it.url,
    filename: inferMediaFilename(it.url, it.kind, it.key),
  }));
  const bridge = typeof window !== 'undefined' ? window.veoFarmDesktop?.bulkDownload : undefined;
  if (bridge) return bridge(files);

  let saved = 0;
  let failed = 0;
  for (const f of files) {
    try {
      await downloadMediaUrl(f.url, f.filename);
      saved += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok: true, saved, failed };
}

export async function downloadMediaUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải file thất bại (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
  } finally {
    // Give the click a tick to register before revoking.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}
