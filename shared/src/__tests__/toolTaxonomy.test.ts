import { describe, expect, it } from 'vitest';
import {
  classifyToolCall,
  detectPendingApprovalCandidate,
  normalizeFilePath,
  unwrapJsonString,
} from '../toolTaxonomy';

describe('unwrapJsonString', () => {
  it('unwraps double-encoded Windows paths without mangling backslashes', () => {
    expect(unwrapJsonString('"D:\\\\Developments\\\\PROJECTS\\\\3D Workspace\\\\src\\\\app.ts"'))
      .toBe('D:\\Developments\\PROJECTS\\3D Workspace\\src\\app.ts');
  });

  it('returns plain strings unchanged', () => {
    expect(unwrapJsonString('D:\\Developments\\PROJECTS\\3D Workspace\\README.md'))
      .toBe('D:\\Developments\\PROJECTS\\3D Workspace\\README.md');
  });
});

describe('classifyToolCall', () => {
  it('classifies read, edit, and write tools across Antigravity argument aliases', () => {
    expect(classifyToolCall('read_file', { Path: '"C:\\\\proj\\\\a.ts"' })).toMatchObject({
      status: 'reading',
      fileAction: 'read',
      fileName: 'a.ts',
      filePath: 'C:\\proj\\a.ts',
    });
    expect(classifyToolCall('replace_file_content', { TargetFile: 'C:\\proj\\b.tsx' })).toMatchObject({
      status: 'editing',
      fileAction: 'edit',
      fileName: 'b.tsx',
      filePath: 'C:\\proj\\b.tsx',
    });
    expect(classifyToolCall('write_file', { Path: '"C:\\\\proj\\\\c.md"' })).toMatchObject({
      status: 'editing',
      fileAction: 'write',
      fileName: 'c.md',
      filePath: 'C:\\proj\\c.md',
    });
  });

  it('classifies run_command, invoke_subagent, send_message, update_focus, and unknown tools', () => {
    expect(classifyToolCall('run_command', { toolSummary: '"Run vitest"', CommandLine: '"npm test"' }))
      .toMatchObject({ status: 'running', summary: 'Run vitest' });
    expect(classifyToolCall('invoke_subagent', { Role: '"Codebase Researcher"', TypeName: '"research"' }))
      .toMatchObject({ status: 'delegating', subagentRole: 'Codebase Researcher', subagentType: 'research' });
    expect(classifyToolCall('send_message', { Recipient: '"child-1"', Message: '"Hi"' }))
      .toMatchObject({ status: 'delegating', recipientId: 'child-1' });
    expect(classifyToolCall('update_focus', { focus: '"Inspecting shader"' }))
      .toMatchObject({ focusText: 'Inspecting shader' });
    expect(classifyToolCall('custom_mcp_tool', {})).toMatchObject({ status: 'running' });
  });
});

describe('normalizeFilePath', () => {
  it('extracts basename for both Windows and POSIX paths', () => {
    expect(normalizeFilePath('D:\\Developments\\PROJECTS\\3D Workspace\\app.tsx').fileName).toBe('app.tsx');
    expect(normalizeFilePath('/tmp/test/index.ts').fileName).toBe('index.ts');
  });
});

describe('detectPendingApprovalCandidate', () => {
  it('detects ask_question immediately (delayMs 0) and classifies it as thinking', () => {
    expect(classifyToolCall('ask_question', {})).toEqual({
      status: 'thinking',
      summary: 'Menunggu jawaban user',
    });

    const candidate = detectPendingApprovalCandidate('ask_question', {
      questions: [{ question: 'Lanjut deploy\n\tke\tproduction?' }],
    });
    expect(candidate).toEqual({
      kind: 'question',
      title: 'Menunggu Jawaban Kamu',
      detail: 'Lanjut deploy ke production?',
      delayMs: 0,
    });

    const fallback = detectPendingApprovalCandidate('ask_question', {});
    expect(fallback).toEqual({
      kind: 'question',
      title: 'Menunggu Jawaban Kamu',
      detail: 'Agent mengajukan pertanyaan di Antigravity',
      delayMs: 0,
    });
  });

  it('detects ArtifactMetadata.RequestFeedback === true immediately (delayMs 0)', () => {
    const candidate = detectPendingApprovalCandidate('write_file', {
      Path: 'C:\\Users\\dev\\.gemini\\brain\\plan.md',
      ArtifactMetadata: {
        RequestFeedback: true,
        Summary: 'Rencana arsitektur\nfitur notifikasi',
      },
    });
    expect(candidate).toMatchObject({
      kind: 'permission',
      title: 'Menunggu Konfirmasi Rencana',
      delayMs: 0,
    });
    expect(candidate?.detail).toContain('plan.md');
  });

  it('detects BypassSandbox run_command with 1500ms delay and ignores normal sandboxed run_command', () => {
    expect(
      detectPendingApprovalCandidate('run_command', {
        CommandLine: 'npm test',
        toolSummary: 'Run unit tests',
      }),
    ).toBeNull();

    expect(
      detectPendingApprovalCandidate('run_command', {
        CommandLine: 'git push origin main',
        BypassSandbox: true,
      }),
    ).toEqual({
      kind: 'permission',
      title: 'Butuh Izin di Luar Sandbox',
      detail: 'git push origin main',
      delayMs: 1500,
    });

    expect(
      detectPendingApprovalCandidate('run_command', {
        CommandLine: 'docker compose up',
        BypassSandbox: 'true',
      }),
    ).toMatchObject({
      kind: 'permission',
      delayMs: 1500,
      detail: 'docker compose up',
    });
  });

  it('distinguishes out-of-workspace file access (1500ms) from in-workspace / .gemini file access (2500ms)', () => {
    const ws = 'D:\\Developments\\PROJECTS\\3D Workspace';

    const outside = detectPendingApprovalCandidate(
      'read_file',
      { Path: 'C:\\Windows\\System32\\drivers\\etc\\hosts' },
      ws,
    );
    expect(outside).toEqual({
      kind: 'permission',
      title: 'Butuh Izin Akses File',
      detail: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
      delayMs: 1500,
    });

    const inside = detectPendingApprovalCandidate(
      'edit_file',
      { Path: 'D:\\Developments\\PROJECTS\\3D Workspace\\server\\src\\server.ts' },
      ws,
    );
    expect(inside).toEqual({
      kind: 'permission',
      title: 'Butuh Izin File',
      detail: 'server.ts',
      delayMs: 2500,
    });

    const geminiInternal = detectPendingApprovalCandidate(
      'write_file',
      { Path: 'C:\\Users\\dev\\.gemini\\antigravity\\brain\\notes.md' },
      ws,
    );
    expect(geminiInternal).toEqual({
      kind: 'permission',
      title: 'Butuh Izin File',
      detail: 'notes.md',
      delayMs: 2500,
    });
  });

  it('detects call_mcp_tool with 2500ms delay and sanitizes/truncates long details to <= 160 chars', () => {
    const mcp = detectPendingApprovalCandidate('call_mcp_tool', {
      ServerName: 'github',
      ToolName: 'create_pull_request',
    });
    expect(mcp).toEqual({
      kind: 'tool_wait',
      title: 'Menunggu Izin Tool MCP',
      detail: 'github/create_pull_request',
      delayMs: 2500,
    });

    const longQuestion = `Line1\n\r\t\x00${'A'.repeat(220)}`;
    const truncated = detectPendingApprovalCandidate('ask_question', {
      questions: [{ question: longQuestion }],
    });
    expect(truncated).not.toBeNull();
    expect(truncated!.detail.length).toBeLessThanOrEqual(160);
    expect(truncated!.detail).not.toMatch(/[\r\n\t\x00]/);
    expect(truncated!.detail.startsWith('Line1 ')).toBe(true);
  });

  it('redacts secrets/credentials, resolves path traversal, and survives prototype keys or malformed args', () => {
    const cmdWithSecrets = detectPendingApprovalCandidate('run_command', {
      CommandLine:
        'GITHUB_TOKEN=ghp_1234567890abcdef curl -H "Authorization: Bearer superSecretJwt123" https://alice:myPass@example.com --password=hunter2',
      BypassSandbox: true,
    });
    expect(cmdWithSecrets).not.toBeNull();
    expect(cmdWithSecrets!.detail).not.toContain('ghp_1234567890abcdef');
    expect(cmdWithSecrets!.detail).not.toContain('superSecretJwt123');
    expect(cmdWithSecrets!.detail).not.toContain('myPass');
    expect(cmdWithSecrets!.detail).not.toContain('hunter2');
    expect(cmdWithSecrets!.detail).toContain('[REDACTED]');

    const classifiedCmd = classifyToolCall('run_command', {
      CommandLine: 'API_KEY=sk-1234567890abcdef node script.js',
    });
    expect(classifiedCmd.summary).not.toContain('sk-1234567890abcdef');

    // Path traversal escaping workspace or .gemini must be flagged as outside workspace (1500ms)
    const ws = 'D:\\Developments\\PROJECTS\\3D Workspace';
    expect(
      detectPendingApprovalCandidate(
        'read_file',
        { Path: 'D:\\Developments\\PROJECTS\\3D Workspace\\..\\..\\Windows\\System32\\drivers\\etc\\hosts' },
        ws,
      ),
    ).toMatchObject({ title: 'Butuh Izin Akses File', delayMs: 1500 });

    expect(
      detectPendingApprovalCandidate(
        'read_file',
        { Path: 'C:\\Users\\dev\\.gemini\\..\\..\\.ssh\\id_rsa' },
        ws,
      ),
    ).toMatchObject({ title: 'Butuh Izin Akses File', delayMs: 1500 });

    expect(
      detectPendingApprovalCandidate('read_file', { Path: '../../.env' }, ws),
    ).toMatchObject({ title: 'Butuh Izin Akses File', delayMs: 1500 });

    // Prototype-key names and malformed non-object args must never throw
    expect(() => classifyToolCall('toString', 'not-an-object' as unknown as Record<string, unknown>)).not.toThrow();
    expect(() => detectPendingApprovalCandidate('constructor', 'bad' as unknown as Record<string, unknown>)).not.toThrow();
    expect(detectPendingApprovalCandidate('valueOf', { Path: Object.create(null) })).toBeNull();
  });
});
