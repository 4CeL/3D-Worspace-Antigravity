import { describe, expect, it, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  HOOK_KEY,
  buildOfficeHookEntry,
  installHookConfig,
  removeHookConfig,
} from '../hookConfig.mjs';

const EMIT_SCRIPT = path.resolve(process.cwd(), 'hooks', 'emit-event.cjs');

const tempDirs: string[] = [];
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-office-hooks-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('hooks/emit-event.cjs', () => {
  it('emits {"decision":"allow"} for PreToolUse and fails open fast when server is offline', () => {
    const started = Date.now();
    const res = spawnSync(process.execPath, [EMIT_SCRIPT], {
      input: JSON.stringify({
        hookEventName: 'PreToolUse',
        conversationId: 'conv-1',
        toolCall: { id: 't1', name: 'edit_file', args: { Path: 'a.ts' } },
      }),
      env: { ...process.env, OFFICE_PORT: '1' },
      encoding: 'utf-8',
      timeout: 3000,
    });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({ decision: 'allow' });
    expect(elapsed).toBeLessThan(2000);
  });

  it('emits valid pass-through JSON for PostToolUse, Stop, SessionStart, PreInvocation, and malformed stdin', () => {
    const cases: Array<{ input: string; expected: unknown }> = [
      { input: JSON.stringify({ hookEventName: 'PostToolUse', conversationId: 'c1' }), expected: {} },
      { input: JSON.stringify({ hookEventName: 'Stop', conversationId: 'c1', fullyIdle: true }), expected: {} },
      { input: JSON.stringify({ hookEventName: 'SessionStart', conversationId: 'c1' }), expected: { injectSteps: [] } },
      { input: JSON.stringify({ hookEventName: 'PreInvocation', conversationId: 'c1' }), expected: { injectSteps: [] } },
      { input: '{not-valid-json', expected: {} },
    ];

    for (const c of cases) {
      const res = spawnSync(process.execPath, [EMIT_SCRIPT], {
        input: c.input,
        env: { ...process.env, OFFICE_PORT: '1' },
        encoding: 'utf-8',
        timeout: 3000,
      });
      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout.trim())).toEqual(c.expected);
    }
  });

  it('still emits {"decision":"allow"} when PreToolUse stdin exceeds 1MB and truncates mid-JSON', () => {
    const hugeContent = 'x'.repeat(1_200_000);
    const oversizedPayload = JSON.stringify({
      hookEventName: 'PreToolUse',
      conversationId: 'conv-big',
      toolCall: { id: 't-big', name: 'write_file', args: { Path: 'big.txt', Content: hugeContent } },
    });

    const res = spawnSync(process.execPath, [EMIT_SCRIPT], {
      input: oversizedPayload,
      env: { ...process.env, OFFICE_PORT: '1' },
      encoding: 'utf-8',
      timeout: 3000,
    });

    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout.trim())).toEqual({ decision: 'allow' });
  });

  it('delivers parsed JSON payload to a live local HTTP endpoint on 127.0.0.1', async () => {
    const received: unknown[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        received.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      const payload = {
        hookEventName: 'PreToolUse',
        conversationId: 'conv-live',
        workspacePaths: ['D:\\Developments\\PROJECTS\\3D Workspace'],
        toolCall: { id: 'toolu_1', name: 'read_file', args: { Path: 'src/index.ts' } },
      };

      const res = await new Promise<{ status: number | null; stdout: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [EMIT_SCRIPT], {
          env: { ...process.env, OFFICE_PORT: String(port) },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ status: code, stdout }));
        child.stdin.end(JSON.stringify(payload));
      });

      expect(res.status).toBe(0);
      expect(JSON.parse(res.stdout.trim())).toEqual({ decision: 'allow' });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        hookEventName: 'PreToolUse',
        conversationId: 'conv-live',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('hooks/hookConfig.mjs', () => {
  it('builds exact Antigravity hooks.json schema with double-quoted Windows path containing spaces', () => {
    const scriptPath = 'D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs';
    const entry = buildOfficeHookEntry(scriptPath);
    const expectedCmd = `node "${scriptPath}"`;

    expect(entry.SessionStart).toEqual([{ type: 'command', command: expectedCmd, timeout: 5 }]);
    expect(entry.PreInvocation).toEqual([{ type: 'command', command: expectedCmd, timeout: 5 }]);
    expect(entry.Stop).toEqual([{ type: 'command', command: expectedCmd, timeout: 5 }]);
    expect(entry.PreToolUse).toEqual([
      { matcher: '*', hooks: [{ type: 'command', command: expectedCmd, timeout: 5 }] },
    ]);
    expect(entry.PostToolUse).toEqual([
      { matcher: '*', hooks: [{ type: 'command', command: expectedCmd, timeout: 5 }] },
    ]);
  });

  it('installHookConfig backs up existing hooks.json and preserves unrelated top-level hooks', () => {
    const dir = makeTempDir();
    const configPath = path.join(dir, 'hooks.json');
    const existing = {
      'my-other-linter': {
        PostToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: './lint.sh' }] }],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

    const result = installHookConfig(configPath, 'D:\\Developments\\PROJECTS\\3D Workspace\\hooks\\emit-event.cjs');
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);

    const updated = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(updated['my-other-linter']).toEqual(existing['my-other-linter']);
    expect(updated[HOOK_KEY]).toBeDefined();
  });

  it('removeHookConfig removes only antigravity-3d-office and preserves unrelated hooks', () => {
    const dir = makeTempDir();
    const configPath = path.join(dir, 'hooks.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        'keep-me': { Stop: [{ type: 'command', command: 'echo ok' }] },
        [HOOK_KEY]: buildOfficeHookEntry('D:\\path\\emit-event.cjs'),
      }),
    );

    const res = removeHookConfig(configPath);
    expect(res.removed).toBe(true);
    expect(res.backupPath).toBeTruthy();

    const after = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(after[HOOK_KEY]).toBeUndefined();
    expect(after['keep-me']).toEqual({ Stop: [{ type: 'command', command: 'echo ok' }] });
  });
});
