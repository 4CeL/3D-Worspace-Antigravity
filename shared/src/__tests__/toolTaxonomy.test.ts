import { describe, expect, it } from 'vitest';
import { classifyToolCall, normalizeFilePath, unwrapJsonString } from '../toolTaxonomy';

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
