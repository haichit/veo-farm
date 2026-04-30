// Download videos via Chrome DevTools Protocol — bypasses CORS / auth on storage.googleapis.com.
// Reference: SPEC_REPLICA_BACKEND.md section 18.13.

import type { Page, CDPSession } from 'puppeteer-core';

export async function downloadVideoViaCDP(
  page: Page,
  cdp: CDPSession,
  videoUrl: string,
  timeoutMs = 20_000,
): Promise<Buffer> {
  // Make sure we receive Network events.
  await cdp.send('Network.enable').catch(() => {});

  return new Promise<Buffer>((resolve, reject) => {
    let resolved = false;
    let requestId: string | null = null;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error('CDP download timeout'));
      }
    }, timeoutMs);

    const onResponse = (params: any) => {
      if (resolved) return;
      const url: string = params.response?.url ?? '';
      const headers = params.response?.headers ?? {};
      const ct = String(headers['content-type'] ?? headers['Content-Type'] ?? '').toLowerCase();
      const matches =
        url.includes(videoUrl) ||
        (url.includes('storage.googleapis.com') && url.includes('ai-sandbox-videofx'));
      if (!matches) return;
      if (ct.startsWith('video/') || ct.includes('mp4') || ct.includes('webm')) {
        requestId = params.requestId;
      }
    };

    const onLoadingFinished = async (params: any) => {
      if (resolved || params.requestId !== requestId) return;
      try {
        const result: any = await cdp.send('Network.getResponseBody', {
          requestId: params.requestId,
        });
        resolved = true;
        clearTimeout(timer);
        cleanup();
        const buffer = result.base64Encoded
          ? Buffer.from(result.body, 'base64')
          : Buffer.from(result.body);
        resolve(buffer);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const cleanup = () => {
      cdp.off('Network.responseReceived', onResponse);
      cdp.off('Network.loadingFinished', onLoadingFinished);
    };

    cdp.on('Network.responseReceived', onResponse);
    cdp.on('Network.loadingFinished', onLoadingFinished);

    // Inject a hidden <video> to trigger the network request inside the authed page context.
    page
      .evaluate((url) => {
        const d = (globalThis as any).document;
        if (!d) return;
        const v = d.createElement('video');
        v.src = url;
        v.style.display = 'none';
        v.preload = 'auto';
        v.muted = true;
        d.body.appendChild(v);
        const playPromise = v.play && v.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
      }, videoUrl)
      .catch((e) => {
        cleanup();
        clearTimeout(timer);
        if (!resolved) {
          resolved = true;
          reject(e);
        }
      });
  });
}
