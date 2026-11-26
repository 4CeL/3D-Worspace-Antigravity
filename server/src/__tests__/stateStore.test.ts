import { describe, expect, it } from 'vitest';
import { StateStore } from '../stateStore';
import { DemoSimulator } from '../demoSimulator';
import type { ParsedTranscriptDelta } from '../transcriptParser';

function emptyDelta(overrides: Partial<ParsedTranscriptDelta> = {}): ParsedTranscriptDelta {
  return {
    activities: [],
    fileTouches: [],
    subagentLinks: [],
    messagePulses: [],
    workspacePaths: [],
    ...overrides,
  };
}

describe('StateStore', () => {
  it('reparents a child subagent mid-flight when child hook arrives BEFORE parent invoke_subagent link', () => {
    const store = new StateStore();
    const now = 1_700_000_000_000;

    // 1. Child arrives first via hook -> initially standalone
    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'child-1',
        toolCall: { id: 't1', name: 'read_file', args: { Path: 'D:\\Projects\\App\\src\\api.ts' } },
      },
      now,
    );

    const before = store.getSnapshot({ now });
    expect(before.clusters).toHaveLength(1);
    expect(before.clusters[0].rootId).toBe('child-1');

    // 2. Parent arrives and links child-1 via invoke_subagent
    store.applyHookEvent(
      {
        hookEventName: 'SessionStart',
        conversationId: 'parent-1',
        workspacePaths: ['D:\\Projects\\App'],
      },
      now + 100,
    );
    store.applyTranscriptDelta(
      'parent-1',
      emptyDelta({
        subagentLinks: [
          {
            childConversationId: 'child-1',
            role: 'API Researcher',
            typeName: 'research',
            workspacePaths: ['D:\\Projects\\App'],
            timestamp: now + 200,
          },
        ],
        lastTimestamp: now + 200,
      }),
      now + 200,
    );

    const after = store.getSnapshot({ now: now + 300 });
    expect(after.clusters).toHaveLength(1);
    expect(after.clusters[0].rootId).toBe('parent-1');
    expect(after.clusters[0].agentIds).toEqual(['parent-1', 'child-1']);
    expect(after.agents['child-1']).toMatchObject({
      parentId: 'parent-1',
      rootId: 'parent-1',
      isSubagent: true,
      role: 'API Researcher',
      projectName: 'App',
    });
  });

  it('deduplicates identical file touch & activity events received from both hook and transcript within 2s', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'c1',
        workspacePaths: ['D:\\Projects\\Demo'],
        toolCall: { id: 'toolu_99', name: 'edit_file', args: { Path: 'D:\\Projects\\Demo\\src\\App.tsx' } },
      },
      t0,
    );

    store.applyTranscriptDelta(
      'c1',
      emptyDelta({
        fileTouches: [{ path: 'D:\\Projects\\Demo\\src\\App.tsx', fileName: 'App.tsx', action: 'edit', timestamp: t0 + 500 }],
        activities: [
          {
            id: 'tr-1-0-edit_file',
            timestamp: t0 + 500,
            toolName: 'edit_file',
            status: 'editing',
            summary: 'Mengedit App.tsx',
            targetPath: 'D:\\Projects\\Demo\\src\\App.tsx',
            fileAction: 'edit',
          },
        ],
        lastStatus: 'editing',
        lastTimestamp: t0 + 500,
      }),
      t0 + 500,
    );

    const snap = store.getSnapshot({ now: t0 + 600 });
    expect(snap.agents['c1'].files).toHaveLength(1);
    expect(snap.agents['c1'].files[0].count).toBe(1);
    expect(snap.agents['c1'].recentActivity).toHaveLength(1);
  });

  it('transitions status across PreInvocation -> PreToolUse edit_file -> PostToolUse error -> Stop fullyIdle', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent({ hookEventName: 'PreInvocation', conversationId: 'c1' }, t0);
    expect(store.getSnapshot({ now: t0 }).agents['c1'].status).toBe('thinking');

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'c1',
        toolCall: { id: 't1', name: 'edit_file', args: { Path: 'D:\\p\\main.ts' } },
      },
      t0 + 100,
    );
    expect(store.getSnapshot({ now: t0 + 100 }).agents['c1']).toMatchObject({
      status: 'editing',
      currentFile: { fileName: 'main.ts', action: 'edit' },
    });

    store.applyHookEvent(
      {
        hookEventName: 'PostToolUse',
        conversationId: 'c1',
        toolCall: { id: 't1', name: 'edit_file', args: { Path: 'D:\\p\\main.ts' } },
        error: 'Target not found',
      },
      t0 + 200,
    );
    expect(store.getSnapshot({ now: t0 + 200 }).agents['c1']).toMatchObject({
      status: 'error',
      errorMessage: 'Target not found',
    });

    store.applyHookEvent(
      { hookEventName: 'Stop', conversationId: 'c1', fullyIdle: true },
      t0 + 300,
    );
    expect(store.getSnapshot({ now: t0 + 300 }).agents['c1'].status).toBe('idle');
  });

  it('transitions active agent without Stop hook to idle after >20s of inactivity via tickIdleCheck', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'c1',
        toolCall: { id: 't1', name: 'read_file', args: { Path: 'D:\\p\\x.ts' } },
      },
      t0,
    );

    expect(store.tickIdleCheck(t0 + 10_000)).toBe(false);
    expect(store.getSnapshot({ now: t0 + 10_000 }).agents['c1'].status).toBe('reading');

    expect(store.tickIdleCheck(t0 + 25_000)).toBe(true);
    expect(store.getSnapshot({ now: t0 + 25_000 }).agents['c1'].status).toBe('idle');
  });

  it('filters clusters by recency window (30m vs 2h) while always keeping non-idle agents visible', () => {
    const store = new StateStore();
    const now = 1_700_000_000_000;

    // Idle session from 60 minutes ago
    store.applyHookEvent(
      { hookEventName: 'Stop', conversationId: 'old-idle', fullyIdle: true, workspacePaths: ['D:\\Old'] },
      now - 60 * 60 * 1000,
    );
    // Active session from 5 seconds ago
    store.applyHookEvent(
      { hookEventName: 'PreInvocation', conversationId: 'active-now', workspacePaths: ['D:\\Now'] },
      now - 5000,
    );

    expect(store.getSnapshot({ recency: '30m', now }).clusters.map((c) => c.rootId)).toEqual(['active-now']);
    expect(store.getSnapshot({ recency: '2h', now }).clusters.map((c) => c.rootId)).toEqual([
      'active-now',
      'old-idle',
    ]);
  });

  it('records send_message pulses and expires them after 5 seconds', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'parent-1',
        toolCall: { id: 'm1', name: 'send_message', args: { Recipient: 'child-1', Message: 'Done?' } },
      },
      t0,
    );

    expect(store.getSnapshot({ now: t0 + 1000 }).activePulses).toHaveLength(1);
    expect(store.getSnapshot({ now: t0 + 6000 }).activePulses).toHaveLength(0);
  });

  it('preserves parallel same-tool transcript calls and read+edit on the same file in one turn without over-deduping', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyTranscriptDelta(
      'c1',
      emptyDelta({
        fileTouches: [
          { path: 'D:\\Proj\\a.ts', fileName: 'a.ts', action: 'read', timestamp: t0 },
          { path: 'D:\\Proj\\a.ts', fileName: 'a.ts', action: 'edit', timestamp: t0 },
        ],
        activities: [
          {
            id: 'tr-1-0-read_file',
            timestamp: t0,
            toolName: 'read_file',
            status: 'reading',
            summary: 'Membaca a.ts',
            targetPath: 'D:\\Proj\\a.ts',
            fileAction: 'read',
          },
          {
            id: 'tr-1-1-edit_file',
            timestamp: t0,
            toolName: 'edit_file',
            status: 'editing',
            summary: 'Mengedit a.ts',
            targetPath: 'D:\\Proj\\a.ts',
            fileAction: 'edit',
          },
          {
            id: 'tr-1-2-run_command',
            timestamp: t0,
            toolName: 'run_command',
            status: 'running',
            summary: 'Run lint',
          },
          {
            id: 'tr-1-3-run_command',
            timestamp: t0,
            toolName: 'run_command',
            status: 'running',
            summary: 'Run tests',
          },
        ],
        lastStatus: 'running',
        lastToolName: 'run_command',
        lastTimestamp: t0,
      }),
      t0,
    );

    const agent = store.getSnapshot({ now: t0 + 100 }).agents['c1'];
    expect(agent.files[0].count).toBe(2);
    expect(agent.files[0].action).toBe('edit');
    expect(agent.recentActivity.filter((a) => a.toolName === 'run_command')).toHaveLength(2);
    expect(agent.currentFile).toBeUndefined();
  });

  it('clears currentFile when agent switches from editing a file to run_command or Stop', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'c1',
        toolCall: { id: 't1', name: 'edit_file', args: { Path: 'D:\\Proj\\app.ts' } },
      },
      t0,
    );
    expect(store.getSnapshot({ now: t0 }).agents['c1'].currentFile?.fileName).toBe('app.ts');

    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'c1',
        toolCall: { id: 't2', name: 'run_command', args: { toolSummary: 'Run tests' } },
      },
      t0 + 500,
    );
    expect(store.getSnapshot({ now: t0 + 500 }).agents['c1'].currentFile).toBeUndefined();
  });

  it('supports renaming main agents and subagents with setAgentAlias and resetting back to default', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      { hookEventName: 'SessionStart', conversationId: 'lead-1', lastUserInput: 'Haloo' },
      t0,
    );
    store.applyTranscriptDelta(
      'lead-1',
      emptyDelta({
        subagentLinks: [
          { childConversationId: 'sub-1', role: 'Codebase Researcher', workspacePaths: [], timestamp: t0 + 50 },
        ],
        lastTimestamp: t0 + 50,
      }),
      t0 + 50,
    );

    expect(store.getSnapshot({ now: t0 + 100 }).agents['lead-1'].displayName).toBe('Haloo');
    expect(store.getSnapshot({ now: t0 + 100 }).agents['sub-1'].displayName).toBe('Codebase Researcher');

    store.setAgentAlias('lead-1', 'Arsitek 3D');
    store.setAgentAlias('sub-1', 'Riset API');

    const renamed = store.getSnapshot({ now: t0 + 200 });
    expect(renamed.agents['lead-1']).toMatchObject({ displayName: 'Arsitek 3D', hasCustomAlias: true });
    expect(renamed.agents['sub-1']).toMatchObject({ displayName: 'Riset API', hasCustomAlias: true });
    expect(renamed.clusters[0].title).toBe('Arsitek 3D');

    // Resetting alias restores original automatic names
    store.setAgentAlias('lead-1', null);
    store.setAgentAlias('sub-1', '');
    const restored = store.getSnapshot({ now: t0 + 300 });
    expect(restored.agents['lead-1']).toMatchObject({ displayName: 'Haloo', hasCustomAlias: false });
    expect(restored.agents['sub-1']).toMatchObject({ displayName: 'Codebase Researcher', hasCustomAlias: false });
  });
});

describe('DemoSimulator', () => {
  it('produces a valid 2-project OfficeSnapshot with main + subagent clusters and advances on tick', () => {
    const sim = new DemoSimulator();
    const snap1 = sim.getSnapshot();
    expect(snap1.demoMode).toBe(true);
    expect(snap1.clusters).toHaveLength(2);
    expect(Object.keys(snap1.agents).length).toBeGreaterThanOrEqual(4);

    const snap2 = sim.step();
    expect(snap2.generatedAt).toBeGreaterThanOrEqual(snap1.generatedAt);
  });
});
