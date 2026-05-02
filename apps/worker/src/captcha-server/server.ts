// Captcha server — HTTPS + Socket.IO for browser-extension communication.
// Self-signed cert generated at boot — required because labs.google is HTTPS
// and browsers block mixed-content WebSocket to plain HTTP localhost.
// Reference: SPEC_REPLICA_BACKEND.md section 18.11.

import https from 'node:https';
import crypto from 'node:crypto';
// @ts-ignore — selfsigned has loose types
import selfsigned from 'selfsigned';
import { Server as SocketIOServer, type Socket } from 'socket.io';

const PORT = parseInt(process.env.CAPTCHA_PORT ?? '3456', 10);
const REQUEST_TIMEOUT_MS = 30_000;
const CAPTCHA_MODE = (process.env.CAPTCHA_MODE ?? 'auto') as 'auto' | 'real_chrome' | 'brave';

interface Client {
  socket: Socket | null; // null for HTTP-polling clients
  browserType: 'chrome' | 'brave' | 'unknown';
  // HTTP-polling support: pending requests dispatched to this client but
  // not yet picked up by a /poll response.
  httpId?: string;
  httpPollResolve?: (req: { requestId: string; action: string } | null) => void;
  httpPollTimer?: NodeJS.Timeout;
  httpPendingRequests?: Array<{ requestId: string; action: string }>;
  lastSeen?: number;
}

const connectedClients = new Map<string, Client>();
const pendingRequests = new Map<
  string,
  { resolve: (v: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>();

function pickClient(): Client | null {
  const all = [...connectedClients.values()];
  if (CAPTCHA_MODE === 'real_chrome') return all.find((c) => c.browserType === 'chrome') ?? null;
  return (
    all.find((c) => c.browserType === 'chrome') ??
    all.find((c) => c.browserType === 'brave') ??
    all[0] ??
    null
  );
}

function alternateClients(excludeId: string): Client[] {
  return [...connectedClients.values()].filter(
    (c) => (c.socket?.id ?? c.httpId ?? '') !== excludeId,
  );
}

function clientId(c: Client): string {
  return c.socket?.id ?? c.httpId ?? '?';
}

function requestFromClient(client: Client, action: string, reqId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const idLabel = client.socket?.id?.slice(0, 6) ?? client.httpId?.slice(0, 6) ?? '?';
    const timer = setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        reject(new Error(`Timeout — client ${idLabel} [${client.browserType}]`));
      }
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(reqId, { resolve, reject, timer });
    if (client.socket) {
      client.socket.emit('server:request-captcha', { requestId: reqId, action });
    } else if (client.httpId) {
      // HTTP-polling client: park the request until /poll picks it up.
      const item = { requestId: reqId, action };
      if (client.httpPollResolve) {
        const r = client.httpPollResolve;
        client.httpPollResolve = undefined;
        if (client.httpPollTimer) clearTimeout(client.httpPollTimer);
        r(item);
      } else {
        client.httpPendingRequests = client.httpPendingRequests ?? [];
        client.httpPendingRequests.push(item);
      }
    }
  });
}

// Sweep stale HTTP-polling clients every 30s.
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of connectedClients) {
    if (c.httpId && c.lastSeen && now - c.lastSeen > 60_000) {
      console.log(`[Captcha] ❌ HTTP client ${id.slice(0, 8)} expired (no poll for 60s)`);
      connectedClients.delete(id);
    }
  }
}, 30_000);

// Self-signed certificate, persisted to disk so Brave doesn't have to
// re-trust on every captcha-server restart. Valid for 365 days, covers
// localhost + 127.0.0.1 via subjectAltName.
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const certDir = path.join(os.homedir(), '.veo-farm-captcha-cert');
const certFile = path.join(certDir, 'cert.pem');
const keyFile = path.join(certDir, 'key.pem');

let tlsPems: { private: string; cert: string };
if (existsSync(certFile) && existsSync(keyFile)) {
  tlsPems = {
    cert: readFileSync(certFile, 'utf8'),
    private: readFileSync(keyFile, 'utf8'),
  };
  console.log(`[Captcha] Loaded persisted cert from ${certDir}`);
} else {
  const tlsAttrs = [{ name: 'commonName', value: 'localhost' }];
  const tlsOpts: any = {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: '127.0.0.1' }, // 7 = IP address
          { type: 2, value: 'localhost' }, // 2 = DNS name
        ],
      },
    ],
  };
  tlsPems = (selfsigned as any).generate(tlsAttrs, tlsOpts) as {
    private: string;
    cert: string;
  };
  if (!existsSync(certDir)) mkdirSync(certDir, { recursive: true });
  writeFileSync(certFile, tlsPems.cert);
  writeFileSync(keyFile, tlsPems.private);
  console.log(`[Captcha] Generated new cert, persisted to ${certDir}`);
}

const httpsServer = https.createServer(
  {
    key: tlsPems.private,
    cert: tlsPems.cert,
    minVersion: 'TLSv1.2',
  },
  async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/captcha') {
    const action = url.searchParams.get('action') ?? 'IMAGE_GENERATION';
    const primary = pickClient();
    if (!primary) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'No browser clients connected' }));
      return;
    }
    const reqId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    try {
      const token = await requestFromClient(primary, action, reqId);
      res.writeHead(200);
      res.end(JSON.stringify({ captcha: token }));
    } catch (err) {
      // Try alternates
      for (const alt of alternateClients(clientId(primary))) {
        const altId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        try {
          const token = await requestFromClient(alt, action, altId);
          res.writeHead(200);
          res.end(JSON.stringify({ captcha: token }));
          return;
        } catch {
          // try next alternate
        }
      }
      res.writeHead(408);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        status: 'ok',
        mode: CAPTCHA_MODE,
        connectedClients: connectedClients.size,
        pendingRequests: pendingRequests.size,
        clients: [...connectedClients.values()].map((c) => ({
          id: clientId(c).slice(0, 8),
          browserType: c.browserType,
          transport: c.socket ? 'socket.io' : 'http',
        })),
      }),
    );
    return;
  }

  // ─── HTTP-polling endpoints (extension MV3 service worker) ───
  // Background SW can't run socket.io cleanly because importScripts() of
  // the bundled socket.io.min.js fails after install. Instead it polls
  // these HTTP endpoints, which fetch() handles fine from extension origin.

  if (req.method === 'POST' && url.pathname === '/client/register') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload: any = {};
    try { payload = JSON.parse(body || '{}'); } catch { /* ignore */ }
    const httpId = `http_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    connectedClients.set(httpId, {
      socket: null,
      browserType: (payload.browserType as Client['browserType']) ?? 'brave',
      httpId,
      lastSeen: Date.now(),
      httpPendingRequests: [],
    });
    console.log(`[Captcha] ✅ HTTP client registered: ${httpId.slice(0, 8)} [${payload.browserType ?? 'brave'}]`);
    res.writeHead(200);
    res.end(JSON.stringify({ clientId: httpId }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/client/poll') {
    const clientId = url.searchParams.get('clientId') ?? '';
    const c = connectedClients.get(clientId);
    if (!c || !c.httpId) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'unknown client; re-register' }));
      return;
    }
    c.lastSeen = Date.now();
    // If there's a pending request, return it immediately.
    if (c.httpPendingRequests && c.httpPendingRequests.length > 0) {
      const item = c.httpPendingRequests.shift()!;
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }
    // Otherwise long-poll for up to 25s.
    const timer = setTimeout(() => {
      if (c.httpPollResolve) {
        c.httpPollResolve = undefined;
        res.writeHead(200);
        res.end(JSON.stringify({ idle: true }));
      }
    }, 25_000);
    c.httpPollTimer = timer;
    c.httpPollResolve = (item) => {
      clearTimeout(timer);
      res.writeHead(200);
      res.end(JSON.stringify(item ?? { idle: true }));
    };
    req.on('close', () => {
      clearTimeout(timer);
      c.httpPollResolve = undefined;
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/client/result') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload: any = {};
    try { payload = JSON.parse(body || '{}'); } catch { /* ignore */ }
    const { requestId, token, error } = payload;
    const p = pendingRequests.get(requestId);
    if (p) {
      clearTimeout(p.timer);
      pendingRequests.delete(requestId);
      if (token) {
        p.resolve(token);
        console.log(`[Captcha] ✅ Solved (${token.length} chars) ${requestId} (HTTP)`);
      } else {
        p.reject(new Error(error || 'unknown'));
        console.error(`[Captcha] ❌ HTTP error: ${error}`);
      }
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/force-refresh') {
    let count = 0;
    for (const c of connectedClients.values()) {
      if (c.socket) {
        c.socket.emit('server:reload-page', { delay: 500 });
        count++;
      } else if (c.httpId) {
        // For HTTP-polling clients, push a synthetic reload request
        // through the same poll channel.
        const reqId = `reload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const item = { requestId: reqId, action: '__RELOAD__' };
        if (c.httpPollResolve) {
          const r = c.httpPollResolve;
          c.httpPollResolve = undefined;
          if (c.httpPollTimer) clearTimeout(c.httpPollTimer);
          r(item);
        } else {
          c.httpPendingRequests = c.httpPendingRequests ?? [];
          c.httpPendingRequests.push(item);
        }
        count++;
      }
    }
    res.writeHead(200);
    res.end(JSON.stringify({ refreshed: count }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const io = new SocketIOServer(httpsServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  connectedClients.set(socket.id, { socket, browserType: 'unknown' });
  console.log(`[Captcha] ✅ Client connected: ${socket.id.slice(0, 8)} (total: ${connectedClients.size})`);

  socket.on('client:ready', (payload: { browserType?: string }) => {
    const c = connectedClients.get(socket.id);
    if (c) c.browserType = (payload?.browserType as Client['browserType']) ?? 'unknown';
    console.log(`[Captcha]    Ready: ${socket.id.slice(0, 8)} [${c?.browserType}]`);
  });

  socket.on(
    'client:captcha-solved',
    ({ requestId, token }: { requestId: string; token: string }) => {
      const p = pendingRequests.get(requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingRequests.delete(requestId);
        p.resolve(token);
        console.log(`[Captcha] ✅ Solved (${token?.length ?? 0} chars) ${requestId}`);
      }
    },
  );

  socket.on(
    'client:captcha-error',
    ({ requestId, error }: { requestId: string; error: string }) => {
      const p = pendingRequests.get(requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingRequests.delete(requestId);
        p.reject(new Error(error));
        console.error(`[Captcha] ❌ Error: ${error}`);
      }
    },
  );

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    console.log(`[Captcha] ❌ Disconnected ${socket.id.slice(0, 8)} (total: ${connectedClients.size})`);
  });
});

httpsServer.listen(PORT, () => {
  const lines = [
    '╔══════════════════════════════════════════════════╗',
    '║  🔓  Veo Farm Captcha Server (HTTPS)             ║',
    `║  HTTPS: https://localhost:${PORT}                      ║`,
    '║  GET   /captcha?action=IMAGE_GENERATION          ║',
    '║  GET   /health                                   ║',
    '║  POST  /force-refresh                            ║',
    `║  Mode:  ${CAPTCHA_MODE.padEnd(40)}║`,
    '║  Cert:  self-signed (sha256, 365d, localhost+IP) ║',
    '║  Tip:   visit https://127.0.0.1:3456/health once ║',
    '║         in Brave to accept the cert.             ║',
    '╚══════════════════════════════════════════════════╝',
  ];
  console.log(lines.join('\n'));
});
