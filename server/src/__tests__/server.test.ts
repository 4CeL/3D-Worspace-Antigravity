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

  it('renames agents via POST /api/agent-alias, broadcasts over WS, and persists aliases across restarts', async () => {
    const brainDir = makeTempDir();
    const aliasFilePath = path.join(makeTempDir(), 'agent-aliases.json');
    const office1 = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir, aliasFilePath });
    const ws = new WebSocket(`ws://127.0.0.1:${office1.port}/ws`);

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      await fetch(`http://127.0.0.1:${office1.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'conv-rename-1',
          lastUserInput: 'Haloo',
        }),
      });

      const renamedPromise = waitForMessage(
        ws,
        (m) => m.type === 'snapshot' && m.payload.agents['conv-rename-1']?.displayName === 'Lead Frontend',
      );

      const renameRes = await fetch(`http://127.0.0.1:${office1.port}/api/agent-alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'conv-rename-1', name: 'Lead Frontend' }),
      });
      expect(renameRes.status).toBe(200);

      const msg = await renamedPromise;
      if (msg.type === 'snapshot') {
        expect(msg.payload.agents['conv-rename-1'].hasCustomAlias).toBe(true);
      }
    } finally {
      ws.close();
      await office1.close();
    }

    // Restart server with the same aliasFilePath -> alias should still apply
    const office2 = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir, aliasFilePath });
    try {
      await fetch(`http://127.0.0.1:${office2.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'conv-rename-1',
          lastUserInput: 'Haloo',
        }),
      });

      const snapRes = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snap = await snapRes.json();
      expect(snap.agents['conv-rename-1'].displayName).toBe('Lead Frontend');
      expect(snap.agents['conv-rename-1'].hasCustomAlias).toBe(true);
    } finally {
      await office2.close();
    }
  });

  it('adds floors and moves teams via HTTP API and persists building config across server restarts', async () => {
    const brainDir = makeTempDir();
    const buildingFilePath = path.join(makeTempDir(), 'building-config.json');
    const office1 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });

    let floor2Id = '';
    try {
      await fetch(`http://127.0.0.1:${office1.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'team-floor-test',
          workspacePaths: ['D:\\Projects\\FloorApp'],
        }),
      });

      const addRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lab AI' }),
      });
      expect(addRes.status).toBe(200);
      const addBody = (await addRes.json()) as { floor: { id: string; index: number; name: string } };
      floor2Id = addBody.floor.id;
      expect(addBody.floor).toMatchObject({ index: 2, name: 'Lab AI' });

      const moveRes = await fetch(`http://127.0.0.1:${office1.port}/api/team-floor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: 'team-floor-test', floorId: floor2Id }),
      });
      expect(moveRes.status).toBe(200);
    } finally {
      await office1.close();
    }

    const office2 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });
    try {
      await fetch(`http://127.0.0.1:${office2.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'team-floor-test',
          workspacePaths: ['D:\\Projects\\FloorApp'],
        }),
      });
      const snapRes = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snap = await snapRes.json();
      expect(snap.floors).toHaveLength(2);
      expect(snap.floors[1].name).toBe('Lab AI');
      expect(snap.clusters[0].floorId).toBe(floor2Id);
    } finally {
      await office2.close();
    }
  });

  it('updates floor theme via POST /api/floors/theme, persists across restarts, and rejects invalid themes with 400', async () => {
    const brainDir = makeTempDir();
    const buildingFilePath = path.join(makeTempDir(), 'building-config.json');
    const office1 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${office1.port}/ws`);

    let floor2Id = '';
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });

      // Invalid theme on POST /api/floors -> 400
      const badAddRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Theme Floor', theme: 'dungeon' }),
      });
      expect(badAddRes.status).toBe(400);

      // Valid theme on POST /api/floors -> 200
      const addRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Creative Studio', theme: 'creative' }),
      });
      expect(addRes.status).toBe(200);
      const addBody = (await addRes.json()) as {
        floor: { id: string; index: number; name: string; theme?: string };
      };
      floor2Id = addBody.floor.id;
      expect(addBody.floor).toMatchObject({ index: 2, name: 'Creative Studio', theme: 'creative' });

      // Invalid themes / floorIds on POST /api/floors/theme -> 400
      const badThemeRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorId: 'floor-1', theme: 'spaceship' }),
      });
      expect(badThemeRes.status).toBe(400);

      const missingFloorRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorId: 'floor-999', theme: 'lobby' }),
      });
      expect(missingFloorRes.status).toBe(400);

      // Valid POST /api/floors/theme -> 200 and broadcasts WS snapshot
      const themeSnapPromise = waitForMessage(
        ws,
        (m) =>
          m.type === 'snapshot' &&
          m.payload.floors.find((f) => f.id === 'floor-1')?.theme === 'pantry',
      );
      const themeRes = await fetch(`http://127.0.0.1:${office1.port}/api/floors/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorId: 'floor-1', theme: 'pantry' }),
      });
      expect(themeRes.status).toBe(200);
      expect(await themeRes.json()).toEqual({ ok: true });

      const wsMsg = await themeSnapPromise;
      expect(wsMsg.type).toBe('snapshot');
    } finally {
      ws.close();
      await office1.close();
    }

    // Restart server -> themes persist
    const office2 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });
    try {
      const snapRes = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snap = await snapRes.json();
      expect(snap.floors).toHaveLength(2);
      expect(snap.floors[0]).toMatchObject({ id: 'floor-1', theme: 'pantry' });
      expect(snap.floors[1]).toMatchObject({ id: floor2Id, name: 'Creative Studio', theme: 'creative' });
    } finally {
      await office2.close();
    }
  });

  it('blocks untrusted Origin (403), non-JSON Content-Type (415), and prototype-pollution rootId (400)', async () => {
    const brainDir = makeTempDir();
    const office = await createOfficeServer({ port: 0, host: '127.0.0.1', brainDir });
    try {
      const evilOriginRes = await fetch(`http://127.0.0.1:${office.port}/api/floors/theme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({ floorId: 'floor-1', theme: 'pantry' }),
      });
      expect(evilOriginRes.status).toBe(403);

      const textPlainRes = await fetch(`http://127.0.0.1:${office.port}/api/floors/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ floorId: 'floor-1', theme: 'pantry' }),
      });
      expect(textPlainRes.status).toBe(415);

      const protoRes = await fetch(`http://127.0.0.1:${office.port}/api/team-floor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: '__proto__', floorId: 'floor-1' }),
      });
      expect(protoRes.status).toBe(400);
    } finally {
      await office.close();
    }
  });

  it('hides agents via POST /api/agents/hide with persistence across restarts, restores via POST /api/agents/unhide-all, and rejects invalid agentIds with 400', async () => {
    const brainDir = makeTempDir();
    const buildingFilePath = path.join(makeTempDir(), 'building-config.json');
    const office1 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });

    try {
      await fetch(`http://127.0.0.1:${office1.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'agent-hide-1',
          workspacePaths: ['D:\\Projects\\HideApp'],
        }),
      });

      // Invalid / forbidden agentIds -> 400
      const protoRes = await fetch(`http://127.0.0.1:${office1.port}/api/agents/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: '__proto__' }),
      });
      expect(protoRes.status).toBe(400);

      const emptyRes = await fetch(`http://127.0.0.1:${office1.port}/api/agents/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: '   ' }),
      });
      expect(emptyRes.status).toBe(400);

      // Valid hide -> 200
      const hideRes = await fetch(`http://127.0.0.1:${office1.port}/api/agents/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'agent-hide-1' }),
      });
      expect(hideRes.status).toBe(200);
      expect(await hideRes.json()).toEqual({ ok: true });

      const snap1Res = await fetch(`http://127.0.0.1:${office1.port}/api/snapshot`);
      const snap1 = await snap1Res.json();
      expect(snap1.hiddenCount).toBe(1);
      expect(snap1.agents['agent-hide-1']).toBeUndefined();
    } finally {
      await office1.close();
    }

    // Restart server -> hidden agent remains hidden and can be restored via /api/agents/unhide-all
    const office2 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });
    try {
      await fetch(`http://127.0.0.1:${office2.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'agent-hide-1',
          workspacePaths: ['D:\\Projects\\HideApp'],
        }),
      });

      const snapHiddenRes = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snapHidden = await snapHiddenRes.json();
      expect(snapHidden.hiddenCount).toBe(1);
      expect(snapHidden.agents['agent-hide-1']).toBeUndefined();

      const unhideRes = await fetch(`http://127.0.0.1:${office2.port}/api/agents/unhide-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(unhideRes.status).toBe(200);
      expect(await unhideRes.json()).toEqual({ ok: true, restored: 1 });

      const snapRestoredRes = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snapRestored = await snapRestoredRes.json();
      expect(snapRestored.hiddenCount).toBe(0);
      expect(snapRestored.agents['agent-hide-1']).toBeDefined();
    } finally {
      await office2.close();
    }
  });

  it('renames rooms via POST /api/room-name, persists across restarts, resets on null, and rejects invalid rootId with 400', async () => {
    const brainDir = makeTempDir();
    const buildingFilePath = path.join(makeTempDir(), 'building-config.json');
    const office1 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });

    try {
      await fetch(`http://127.0.0.1:${office1.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'room-api-1',
          workspacePaths: ['D:\\Projects\\RoomApp'],
        }),
      });

      // Invalid / prototype-pollution rootId -> 400
      const protoRes = await fetch(`http://127.0.0.1:${office1.port}/api/room-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: '__proto__', name: 'Evil' }),
      });
      expect(protoRes.status).toBe(400);

      const emptyRes = await fetch(`http://127.0.0.1:${office1.port}/api/room-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: '   ', name: 'NoRoot' }),
      });
      expect(emptyRes.status).toBe(400);

      // Valid room rename -> 200
      const renameRes = await fetch(`http://127.0.0.1:${office1.port}/api/room-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: 'room-api-1', name: '  Ruang Backend  ' }),
      });
      expect(renameRes.status).toBe(200);
      expect(await renameRes.json()).toEqual({ ok: true });

      const snap1Res = await fetch(`http://127.0.0.1:${office1.port}/api/snapshot`);
      const snap1 = await snap1Res.json();
      expect(snap1.clusters[0]).toMatchObject({
        rootId: 'room-api-1',
        roomName: 'Ruang Backend',
        hasCustomRoomName: true,
      });
    } finally {
      await office1.close();
    }

    // Restart server -> roomName persists in building-config.json
    const office2 = await createOfficeServer({
      port: 0,
      host: '127.0.0.1',
      brainDir,
      buildingFilePath,
    });
    try {
      await fetch(`http://127.0.0.1:${office2.port}/api/hook-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hookEventName: 'SessionStart',
          conversationId: 'room-api-1',
          workspacePaths: ['D:\\Projects\\RoomApp'],
        }),
      });

      const snap2Res = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snap2 = await snap2Res.json();
      expect(snap2.clusters[0]).toMatchObject({
        rootId: 'room-api-1',
        roomName: 'Ruang Backend',
        hasCustomRoomName: true,
      });

      // Reset via null -> reverts to projectName
      const resetRes = await fetch(`http://127.0.0.1:${office2.port}/api/room-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootId: 'room-api-1', name: null }),
      });
      expect(resetRes.status).toBe(200);

      const snap3Res = await fetch(`http://127.0.0.1:${office2.port}/api/snapshot`);
      const snap3 = await snap3Res.json();
      expect(snap3.clusters[0]).toMatchObject({
        rootId: 'room-api-1',
        roomName: 'RoomApp',
        hasCustomRoomName: false,
      });
    } finally {
      await office2.close();
    }
  });
});
