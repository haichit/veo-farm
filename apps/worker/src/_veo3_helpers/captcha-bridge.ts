// HTTPS client → captcha-server local Socket.IO bridge.
// Self-signed cert: rejectUnauthorized=false skips Node's TLS validation.
// Reference: SPEC_REPLICA_BACKEND.md section 18.10.

import got from 'got';

const TLS_OPTS = { https: { rejectUnauthorized: false } } as const;

export class CaptchaBridge {
  constructor(private serverUrl = 'https://127.0.0.1:3456') {}

  async getToken(action = 'IMAGE_GENERATION'): Promise<string> {
    const res = await got(`${this.serverUrl}/captcha?action=${action}`, {
      timeout: { request: 30_000 },
      responseType: 'json',
      throwHttpErrors: false,
      ...TLS_OPTS,
    });
    if (res.statusCode !== 200) {
      throw new Error(`Captcha bridge ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    const body = res.body as { captcha?: string; error?: string };
    if (!body?.captcha) throw new Error(`No token: ${JSON.stringify(body)}`);
    return body.captcha;
  }

  async forceRefresh(): Promise<void> {
    await got.post(`${this.serverUrl}/force-refresh`, {
      timeout: { request: 5000 },
      throwHttpErrors: false,
      ...TLS_OPTS,
    });
  }

  async health(): Promise<{ status: string; connectedClients: number; mode?: string }> {
    const res = await got(`${this.serverUrl}/health`, {
      responseType: 'json',
      timeout: { request: 3000 },
      throwHttpErrors: false,
      ...TLS_OPTS,
    });
    return res.body as { status: string; connectedClients: number; mode?: string };
  }
}
