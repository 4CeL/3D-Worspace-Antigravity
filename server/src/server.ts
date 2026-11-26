import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientMessage,
  HookEventPayload,
  OfficeSnapshot,
  RecencyWindow,
  ServerMessage,
} from '@office/shared';
import { DemoSimulator } from './demoSimulator.js';
import { StateStore } from './stateStore.js';
import { TranscriptWatcher } from './transcriptWatcher.js';

export interface OfficeServerOptions {
  port?: number;
  host?: string;
  brainDir?: string;
  staticDir?: string;
}

export interface RunningOfficeServer {
  server: http.Server;
  port: number;
  host: string;
  close: () => Promise<void>;
}

const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function isValidRecency(val: unknown): val is RecencyWindow {
  return val === '30m' || val === '2h' || val === 'today';
}

function setLocalCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (
    origin &&
    (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function createOfficeServer(
  options: OfficeServerOptions = {},
): Promise<RunningOfficeServer> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? Number(process.env.OFFICE_PORT || 4174);
  const stateStore = new StateStore();
  const demoSimulator = new DemoSimulator();
  const watcher = options.brainDir ? new TranscriptWatcher({ brainDir: options.brainDir }) : null;

  let demoMode = false;
  const clientRecency = new Map<WebSocket, RecencyWindow>();

  const getCurrentSnapshot = (recency: RecencyWindow): OfficeSnapshot =>
    demoMode ? demoSimulator.getSnapshot() : stateStore.getSnapshot({ recency });

  const sendSnapshotToClient = (ws: WebSocket): void => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const recency = clientRecency.get(ws) ?? '30m';
    const msg: ServerMessage = { type: 'snapshot', payload: getCurrentSnapshot(recency) };
    ws.send(JSON.stringify(msg));
  };

  const broadcastSnapshots = (): void => {
    for (const ws of clientRecency.keys()) {
      sendSnapshotToClient(ws);
    }
  };

  const setDemoMode = (enabled: boolean): void => {
    if (demoMode === enabled) return;
    demoMode = enabled;
    if (demoMode) {
      demoSimulator.start(() => {
        broadcastSnapshots();
      });
    } else {
      demoSimulator.stop();
      broadcastSnapshots();
    }
  };

  stateStore.onChange(() => {
    if (!demoMode) {
      broadcastSnapshots();
    }
  });

  if (watcher) {
    watcher.onDelta(({ conversationId, delta }) => {
      stateStore.applyTranscriptDelta(conversationId, delta);
    });
    watcher.start();
  }

  const idleTimer = setInterval(() => {
    stateStore.tickIdleCheck();
  }, 2000);
  idleTimer.unref();

  const server = http.createServer(async (req, res) => {
    setLocalCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const snap = stateStore.getSnapshot();
      sendJson(res, 200, {
        ok: true,
        hookActive: snap.hookActive,
        lastHookAt: snap.lastHookAt,
        demoMode,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/snapshot') {
      const recencyParam = url.searchParams.get('recency');
      const recency: RecencyWindow = isValidRecency(recencyParam) ? recencyParam : '30m';
      sendJson(res, 200, getCurrentSnapshot(recency));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/hook-event') {
      try {
        const body = await readJsonBody(req);
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { ok: false, error: 'Invalid payload' });
          return;
        }
        const payload = body as HookEventPayload;
        stateStore.applyHookEvent(payload);
        if (watcher && payload.conversationId) {
          watcher.ensureTracked(payload.conversationId, payload.transcriptPath);
        }
        sendJson(res, 200, { ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bad request';
        sendJson(res, msg === 'PAYLOAD_TOO_LARGE' ? 413 : 400, { ok: false, error: msg });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/demo') {
      try {
        const body = (await readJsonBody(req)) as { enabled?: boolean };
        setDemoMode(Boolean(body?.enabled));
        sendJson(res, 200, { ok: true, demoMode });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bad request';
        sendJson(res, 400, { ok: false, error: msg });
      }
      return;
    }

    // Optional static SPA serving for production build
    if (req.method === 'GET' && options.staticDir && fs.existsSync(options.staticDir)) {
      const safePath = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = path.join(options.staticDir, safePath);
      const resolvedStatic = path.resolve(options.staticDir);
      const resolvedTarget = path.resolve(target);
      const candidate =
        resolvedTarget.startsWith(resolvedStatic) &&
        fs.existsSync(resolvedTarget) &&
        fs.statSync(resolvedTarget).isFile()
          ? resolvedTarget
          : path.join(resolvedStatic, 'index.html');

      if (fs.existsSync(candidate)) {
        const ext = path.extname(candidate).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(candidate).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    clientRecency.set(ws, '30m');
    sendSnapshotToClient(ws);

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString('utf8')) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'subscribe') {
        if (isValidRecency(msg.recency)) {
          clientRecency.set(ws, msg.recency);
        }
        sendSnapshotToClient(ws);
      } else if (msg.type === 'set_recency') {
        if (isValidRecency(msg.recency)) {
          clientRecency.set(ws, msg.recency);
          sendSnapshotToClient(ws);
        }
      } else if (msg.type === 'toggle_demo') {
        setDemoMode(Boolean(msg.enabled));
      } else if (msg.type === 'agent_command') {
        const ack: ServerMessage = {
          type: 'command_ack',
          requestId: msg.requestId || '',
          ok: false,
          reason: 'not_implemented',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(ack));
        }
      }
    });

    ws.on('close', () => {
      clientRecency.delete(ws);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : requestedPort;

  const close = async (): Promise<void> => {
    clearInterval(idleTimer);
    demoSimulator.stop();
    watcher?.stop();
    for (const ws of clientRecency.keys()) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    clientRecency.clear();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { server, port: actualPort, host, close };
}
