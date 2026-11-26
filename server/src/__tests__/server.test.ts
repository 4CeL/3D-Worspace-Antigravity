import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { ServerMessage } from '@office/shared';
import { createOfficeServer } from '../server';

const tempDirs: string[] = [];
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-office-srv-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: ServerMessage) => boolean,
  timeoutMs = 3000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), timeoutMs);
    const handler = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString('utf8')) as ServerMessage;
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(parsed);
      }
    };
    ws.on('message', handler);
  });
}

describe('createOfficeServer', () => {
  it('ingests POST /api/hook-event and broadcasts live snapshot over WebSocket', async () => {
    const brainDir = makeTempDir();
    const office = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir });

    const ws = new WebSocket(`ws://127.0.0.1:${office.port}/ws`);
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      const nextSnapPromise = waitForMessage(
        ws,
        (m) => m.type === 'snapshot' && Boolean(m.payload.agents['conv-ws-1']),
      );

      const res = await fetch(`http://127.0.0.1:${office.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'PreToolUse',
          conversationId: 'conv-ws-1',
          workspacePaths: ['D:\\Projects\\LiveApp'],
          toolCall: { id: 't1', name: 'edit_file', args: { Path: 'D:\\Projects\\LiveApp\\src\\app.ts' } },
        }),
      });
      expect(res.status).toBe(200);

      const msg = await nextSnapPromise;
      expect(msg.type).toBe('snapshot');
      if (msg.type === 'snapshot') {
        expect(msg.payload.hookActive).toBe(true);
        expect(msg.payload.agents['conv-ws-1'].currentFile?.fileName).toBe('app.ts');
      }
    } finally {
      ws.close();
      await office.close();
    }
  });

  it('toggles DemoSimulator via POST /api/demo and streams demo clusters without mutating live state', async () => {
    const brainDir = makeTempDir();
    const office = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir });

    try {
      const enableRes = await fetch(`http://127.0.0.1:${office.port}/api/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(enableRes.status).toBe(200);

      const demoSnapRes = await fetch(`http://127.0.0.1:${office.port}/api/snapshot`);
      const demoSnap = await demoSnapRes.json();
      expect(demoSnap.demoMode).toBe(true);
      expect(demoSnap.clusters.length).toBeGreaterThanOrEqual(2);

      await fetch(`http://127.0.0.1:${office.port}/api/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      const liveSnapRes = await fetch(`http://127.0.0.1:${office.port}/api/snapshot`);
      const liveSnap = await liveSnapRes.json();
      expect(liveSnap.demoMode).toBe(false);
      expect(liveSnap.clusters).toHaveLength(0);
    } finally {
      await office.close();
    }
  });

  it('returns typed command_ack not_implemented for v2 agent_command over WebSocket', async () => {
    const brainDir = makeTempDir();
    const office = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir });
    const ws = new WebSocket(`ws://127.0.0.1:${office.port}/ws`);

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      const ackPromise = waitForMessage(ws, (m) => m.type === 'command_ack');
      ws.send(
        JSON.stringify({
          type: 'agent_command',
          requestId: 'req-42',
          conversationId: 'c1',
          command: 'send_prompt',
        }),
      );

      const ack = await ackPromise;
      expect(ack).toEqual({
        type: 'command_ack',
        requestId: 'req-42',
        ok: false,
        reason: 'not_implemented',
      });
    } finally {
      ws.close();
      await office.close();
    }
  });

  it('rejects malformed JSON POST bodies cleanly without crashing the server', async () => {
    const brainDir = makeTempDir();
    const office = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir });

    try {
      const badRes = await fetch(`http://127.0.0.1:${office.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad-json',
      });
      expect(badRes.status).toBe(400);

      const healthRes = await fetch(`http://127.0.0.1:${office.port}/api/health`);
      expect(healthRes.status).toBe(200);
    } finally {
      await office.close();
    }
  });
});
