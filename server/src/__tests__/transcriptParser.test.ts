import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createTranscriptParseState,
  decodeFileUri,
  parseTranscriptChunk,
} from '../transcriptParser';
import { TranscriptWatcher } from '../transcriptWatcher';

const tempDirs: string[] = [];
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-office-transcript-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('decodeFileUri', () => {
  it('decodes Windows file URIs with percent-encoded spaces and colons', () => {
    expect(decodeFileUri('file:///d%3A/Developments/PROJECTS/3D%20Workspace'))
      .toBe('d:\\Developments\\PROJECTS\\3D Workspace');
  });
});

describe('parseTranscriptChunk', () => {
  it('parses read_file, edit_file, write_file, run_command, and update_focus with double-encoded Windows paths', () => {
    const state = createTranscriptParseState();
    const lines = [
      JSON.stringify({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        created_at: '2026-11-26T05:00:00Z',
        content: '<USER_REQUEST>\nBuild 3D office\n</USER_REQUEST>',
      }),
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-26T05:00:02Z',
        model: 'gemini-4-neon-high',
        tool_calls: [
          { name: 'read_file', args: { Path: '"D:\\\\Developments\\\\PROJECTS\\\\3D Workspace\\\\a.ts"' } },
          { name: 'edit_file', args: { Path: '"D:\\\\Developments\\\\PROJECTS\\\\3D Workspace\\\\b.tsx"' } },
          { name: 'write_file', args: { Path: '"D:\\\\Developments\\\\PROJECTS\\\\3D Workspace\\\\c.md"' } },
          { name: 'run_command', args: { toolSummary: '"Run unit tests"', CommandLine: '"npm test"' } },
          { name: 'update_focus', args: { focus: '"Wiring telemetry"' } },
        ],
      }),
    ].join('\n') + '\n';

    const delta = parseTranscriptChunk(state, lines);
    expect(delta.modelName).toBe('gemini-4-neon-high');
    expect(delta.firstUserPrompt).toBe('Build 3D office');
    expect(delta.focusText).toBe('Wiring telemetry');
    expect(delta.fileTouches).toHaveLength(3);
    expect(delta.fileTouches[0]).toMatchObject({
      path: 'D:\\Developments\\PROJECTS\\3D Workspace\\a.ts',
      action: 'read',
    });
    expect(delta.fileTouches[1]).toMatchObject({
      path: 'D:\\Developments\\PROJECTS\\3D Workspace\\b.tsx',
      action: 'edit',
    });
    expect(delta.fileTouches[2]).toMatchObject({
      path: 'D:\\Developments\\PROJECTS\\3D Workspace\\c.md',
      action: 'write',
    });
    expect(delta.activities.some((a) => a.toolName === 'run_command' && a.summary === 'Run unit tests')).toBe(true);
  });

  it('buffers partial JSONL lines split across chunks without losing or duplicating steps', () => {
    const state = createTranscriptParseState();
    const fullLine =
      JSON.stringify({
        step_index: 3,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-26T05:01:00Z',
        tool_calls: [{ name: 'edit_file', args: { Path: '"C:\\\\app\\\\index.ts"' } }],
      }) + '\n';

    const mid = Math.floor(fullLine.length / 2);
    const delta1 = parseTranscriptChunk(state, fullLine.slice(0, mid));
    expect(delta1.fileTouches).toHaveLength(0);

    const delta2 = parseTranscriptChunk(state, fullLine.slice(mid));
    expect(delta2.fileTouches).toHaveLength(1);
    expect(delta2.fileTouches[0].path).toBe('C:\\app\\index.ts');
  });

  it('skips malformed JSON lines gracefully without crashing subsequent valid lines', () => {
    const state = createTranscriptParseState();
    const chunk = [
      '{corrupt-json-line',
      JSON.stringify({
        step_index: 4,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-26T05:02:00Z',
        tool_calls: [{ name: 'read_file', args: { Path: '"C:\\\\ok.ts"' } }],
      }),
    ].join('\n') + '\n';

    const delta = parseTranscriptChunk(state, chunk);
    expect(delta.fileTouches).toHaveLength(1);
    expect(delta.fileTouches[0].fileName).toBe('ok.ts');
  });

  it('correlates two parallel invoke_subagent calls to their sequential GENERIC tool results by index order', () => {
    const state = createTranscriptParseState();
    const chunk = [
      JSON.stringify({
        step_index: 10,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-26T05:05:00Z',
        tool_calls: [
          { name: 'invoke_subagent', args: { Role: '"Codebase Researcher"', TypeName: '"research"' } },
          { name: 'invoke_subagent', args: { Role: '"UI Reviewer"', TypeName: '"self"' } },
        ],
      }),
      JSON.stringify({
        step_index: 11,
        source: 'MODEL',
        type: 'GENERIC',
        status: 'DONE',
        created_at: '2026-11-26T05:05:01Z',
        content:
          'Created the following subagent:\n{\n  "conversationId": "child-uuid-1",\n  "workspaceUris": ["file:///d%3A/Developments/PROJECTS/3D%20Workspace"]\n}',
      }),
      JSON.stringify({
        step_index: 12,
        source: 'MODEL',
        type: 'GENERIC',
        status: 'DONE',
        created_at: '2026-11-26T05:05:02Z',
        content:
          'Created the following subagent:\n{\n  "conversationId": "child-uuid-2",\n  "workspaceUris": ["file:///d%3A/Developments/PROJECTS/3D%20Workspace"]\n}',
      }),
    ].join('\n') + '\n';

    const delta = parseTranscriptChunk(state, chunk);
    expect(delta.subagentLinks).toEqual([
      {
        childConversationId: 'child-uuid-1',
        role: 'Codebase Researcher',
        typeName: 'research',
        workspacePaths: ['d:\\Developments\\PROJECTS\\3D Workspace'],
        timestamp: Date.parse('2026-11-26T05:05:01Z'),
      },
      {
        childConversationId: 'child-uuid-2',
        role: 'UI Reviewer',
        typeName: 'self',
        workspacePaths: ['d:\\Developments\\PROJECTS\\3D Workspace'],
        timestamp: Date.parse('2026-11-26T05:05:02Z'),
      },
    ]);
  });
});

describe('TranscriptWatcher', () => {
  it('tails appended transcript.jsonl lines inside a brain directory', async () => {
    const brainDir = makeTempDir();
    const convId = '11111111-2222-3333-4444-555555555555';
    const logsDir = path.join(brainDir, convId, '.system_generated', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const transcriptPath = path.join(logsDir, 'transcript.jsonl');

    fs.writeFileSync(
      transcriptPath,
      JSON.stringify({
        step_index: 0,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date().toISOString(),
        tool_calls: [{ name: 'read_file', args: { Path: '"D:\\\\proj\\\\first.ts"' } }],
      }) + '\n',
    );

    const deltas: Array<{ conversationId: string; files: string[] }> = [];
    const watcher = new TranscriptWatcher({ brainDir, scanIntervalMs: 100 });
    watcher.onDelta(({ conversationId, delta }) => {
      if (delta.fileTouches.length > 0) {
        deltas.push({ conversationId, files: delta.fileTouches.map((f) => f.fileName) });
      }
    });

    watcher.start();
    try {
      await new Promise((r) => setTimeout(r, 150));
      fs.appendFileSync(
        transcriptPath,
        JSON.stringify({
          step_index: 1,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: new Date().toISOString(),
          tool_calls: [{ name: 'edit_file', args: { Path: '"D:\\\\proj\\\\second.ts"' } }],
        }) + '\n',
      );
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      watcher.stop();
    }

    const allFiles = deltas.flatMap((d) => d.files);
    expect(allFiles).toContain('first.ts');
    expect(allFiles).toContain('second.ts');
  });
});
