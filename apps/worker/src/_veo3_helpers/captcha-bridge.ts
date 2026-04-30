// HTTP client → captcha-server local Socket.IO bridge.
// Reference: SPEC_REPLICA_BACKEND.md section 18.10.

import got from 'got';

export class CaptchaBridge {
  constructor(private serverUrl = 'http://127.0.0.1:3456') {}

  async getToken(action = 'IMAGE_GENERATION'): Promise<string> {
    const res = await got(`${this.serverUrl}/captcha?action=${action}`, {
      timeout: { request: 30_000 },
      responseType: 'json',
      throwHttpErrors: false,
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
    });
  }

  async health(): Promise<{ status: string; connectedClients: number; mode?: string }> {
    const res = await got(`${this.serverUrl}/health`, {
      responseType: 'json',
      timeout: { request: 3000 },
      throwHttpErrors: false,
    });
    return res.body as { status: string; connectedClients: number; mode?: string };
  }
}
