// Captcha server — Express HTTP + Socket.IO for browser-extension communication.
// Reference: SPEC_REPLICA_BACKEND.md section 18.11.

import http from 'node:http';
import crypto from 'node:crypto';
import { Server as SocketIOServer, type Socket } from 'socket.io';

const PORT = parseInt(process.env.CAPTCHA_PORT ?? '3456', 10);
const REQUEST_TIMEOUT_MS = 30_000;
const CAPTCHA_MODE = (process.env.CAPTCHA_MODE ?? 'auto') as 'auto' | 'real_chrome' | 'brave';

interface Client {
  socket: Socket;
  browserType: 'chrome' | 'brave' | 'unknown';
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
  return [...connectedClients.values()].filter((c) => c.socket.id !== excludeId);
}

function requestFromClient(client: Client, action: string, reqId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        pendingRequests.delete(reqId);
        reject(new Error(`Timeout — client ${client.socket.id.slice(0, 6)} [${client.browserType}]`));
      }
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(reqId, { resolve, reject, timer });
    client.socket.emit('server:request-captcha', { requestId: reqId, action });
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
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
      for (const alt of alternateClients(primary.socket.id)) {
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
          id: c.socket.id.slice(0, 8),
          browserType: c.browserType,
        })),
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/force-refresh') {
    let count = 0;
    for (const { socket } of connectedClients.values()) {
      socket.emit('server:reload-page', { delay: 500 });
      count++;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ refreshed: count }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

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

httpServer.listen(PORT, () => {
  const lines = [
    '╔══════════════════════════════════════════════════╗',
    '║  🔓  Veo Farm Captcha Server                     ║',
    `║  HTTP:  http://localhost:${PORT}                       ║`,
    '║  GET   /captcha?action=IMAGE_GENERATION          ║',
    '║  GET   /health                                   ║',
    '║  POST  /force-refresh                            ║',
    `║  Mode:  ${CAPTCHA_MODE.padEnd(40)}║`,
    '╚══════════════════════════════════════════════════╝',
  ];
  console.log(lines.join('\n'));
});
