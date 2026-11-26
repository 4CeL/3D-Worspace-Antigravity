import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { StateStore } from '../stateStore';
import { DemoSimulator } from '../demoSimulator';
import {
  FLOOR_THEMES,
  defaultThemeForFloorIndex,
  isValidFloorTheme,
  loadBuildingConfig,
  normalizeBuildingConfig,
} from '../buildingStore';
import type { ParsedTranscriptDelta } from '../transcriptParser';

function emptyDelta(overrides: Partial<ParsedTranscriptDelta> = {}): ParsedTranscriptDelta {
  return {
    activities: [],
    fileTouches: [],
    subagentLinks: [],
    failedSubagentIds: [],
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

  it('supports adding, renaming, assigning teams to floors, and migrating teams back to Floor 1 when a floor is deleted', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent({ hookEventName: 'SessionStart', conversationId: 'team-a', workspacePaths: ['D:\\A'] }, t0);
    store.applyHookEvent({ hookEventName: 'SessionStart', conversationId: 'team-b', workspacePaths: ['D:\\B'] }, t0 + 10);

    const initial = store.getSnapshot({ now: t0 + 20 });
    expect(initial.floors).toHaveLength(1);
    expect(initial.clusters.every((c) => c.floorId === 'floor-1')).toBe(true);

    const floor2 = store.addFloor('Mobile Lab');
    expect(floor2).toMatchObject({ index: 2, name: 'Mobile Lab' });
    expect(store.renameFloor(floor2.id, 'Riset & Mobile')).toBe(true);
    expect(store.setTeamFloor('team-b', floor2.id)).toBe(true);

    const moved = store.getSnapshot({ now: t0 + 30 });
    expect(moved.floors).toHaveLength(2);
    expect(moved.floors[1].name).toBe('Riset & Mobile');
    expect(moved.clusters.find((c) => c.rootId === 'team-b')?.floorId).toBe(floor2.id);

    // Floor 1 cannot be deleted
    expect(store.deleteFloor('floor-1')).toBe(false);

    // Deleting Floor 2 safely moves team-b back to Floor 1
    expect(store.deleteFloor(floor2.id)).toBe(true);
    const afterDelete = store.getSnapshot({ now: t0 + 40 });
    expect(afterDelete.floors).toHaveLength(1);
    expect(afterDelete.clusters.find((c) => c.rootId === 'team-b')?.floorId).toBe('floor-1');
  });

  it('assigns default floor themes, supports setFloorTheme, and rejects invalid themes', () => {
    expect(FLOOR_THEMES).toEqual(['engineering', 'lobby', 'creative', 'pantry']);
    expect(isValidFloorTheme('engineering')).toBe(true);
    expect(isValidFloorTheme('pantry')).toBe(true);
    expect(isValidFloorTheme('rooftop')).toBe(false);
    expect(isValidFloorTheme(null)).toBe(false);
    expect(defaultThemeForFloorIndex(1)).toBe('engineering');
    expect(defaultThemeForFloorIndex(2)).toBe('lobby');
    expect(defaultThemeForFloorIndex(3)).toBe('creative');
    expect(defaultThemeForFloorIndex(4)).toBe('pantry');
    expect(defaultThemeForFloorIndex(5)).toBe('engineering');

    const normalized = normalizeBuildingConfig({
      floors: [
        { id: 'f1', name: 'One' },
        { id: 'f2', name: 'Two', theme: 'invalid-theme' },
        { id: 'f3', name: 'Three', theme: 'pantry' },
      ],
    });
    expect(normalized.floors.map((f) => f.theme)).toEqual(['engineering', 'lobby', 'pantry']);

    const store = new StateStore();
    const onChange = vi.fn();
    store.onChange(onChange);

    // Default Floor 1 has 'engineering'
    expect(store.getSnapshot().floors[0].theme).toBe('engineering');

    // Adding floors assigns default theme by index unless valid theme provided
    const f2 = store.addFloor('Second');
    const f3 = store.addFloor('Third', 'pantry');
    const f4 = store.addFloor('Fourth');
    expect(f2?.theme).toBe('lobby');
    expect(f3?.theme).toBe('pantry');
    expect(f4?.theme).toBe('pantry');

    onChange.mockClear();
    expect(store.setFloorTheme('floor-1', 'creative')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().floors[0].theme).toBe('creative');

    // Rejects invalid theme and unknown floorId
    onChange.mockClear();
    expect(store.setFloorTheme('floor-1', 'invalid' as never)).toBe(false);
    expect(store.setFloorTheme('non-existent', 'lobby')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(store.getSnapshot().floors[0].theme).toBe('creative');
  });

  it('loads legacy building-config.json without theme or with invalid theme safely and preserves remaining themes on deleteFloor', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-bldg-test-'));
    try {
      const legacyFile = path.join(tmpDir, 'building-config.json');
      fs.writeFileSync(
        legacyFile,
        JSON.stringify({
          floors: [
            { id: 'floor-1', index: 1, name: 'Legacy 1' },
            { id: 'floor-2', index: 2, name: 'Legacy 2', theme: 'not-a-theme' },
            { id: 'floor-3', index: 3, name: 'Legacy 3', theme: 'pantry' },
          ],
          teamFloors: { 'team-x': 'floor-2' },
        }),
        'utf-8',
      );

      const loaded = loadBuildingConfig(legacyFile);
      expect(loaded.floors.map((f) => ({ id: f.id, theme: f.theme }))).toEqual([
        { id: 'floor-1', theme: 'engineering' },
        { id: 'floor-2', theme: 'lobby' },
        { id: 'floor-3', theme: 'pantry' },
      ]);

      // Corrupt JSON falls back cleanly to default building config
      const corruptFile = path.join(tmpDir, 'corrupt.json');
      fs.writeFileSync(corruptFile, '{not valid json', 'utf-8');
      expect(loadBuildingConfig(corruptFile).floors).toEqual([
        { id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'engineering' },
      ]);

      // Deleting middle floor preserves chosen themes on remaining floors
      const store = new StateStore({ initialBuilding: loaded });
      expect(store.setFloorTheme('floor-1', 'creative')).toBe(true);
      expect(store.deleteFloor('floor-2')).toBe(true);
      const after = store.getSnapshot();
      expect(after.floors).toEqual([
        { id: 'floor-1', index: 1, name: 'Legacy 1', theme: 'creative' },
        { id: 'floor-3', index: 2, name: 'Legacy 3', theme: 'pantry' },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('suppresses failed-start ghost subagents and empty spawn stubs while keeping subagents that did real work', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      { hookEventName: 'SessionStart', conversationId: 'lead-1', workspacePaths: ['D:\\Proj'] },
      t0,
    );
    store.applyTranscriptDelta(
      'lead-1',
      emptyDelta({
        subagentLinks: [
          { childConversationId: 'ghost-failed', role: 'Ghost Failed', workspacePaths: ['D:\\Proj'], timestamp: t0 + 100 },
          { childConversationId: 'worked-then-failed', role: 'Worked Sub', workspacePaths: ['D:\\Proj'], timestamp: t0 + 100 },
          { childConversationId: 'empty-stub', role: 'Empty Stub', workspacePaths: ['D:\\Proj'], timestamp: t0 + 100 },
        ],
        failedSubagentIds: ['ghost-failed', 'worked-then-failed'],
        lastTimestamp: t0 + 100,
      }),
      t0 + 100,
    );

    // worked-then-failed actually touched a file before failing -> must remain visible
    store.applyTranscriptDelta(
      'worked-then-failed',
      emptyDelta({
        fileTouches: [{ path: 'D:\\Proj\\src\\a.ts', fileName: 'a.ts', action: 'read', timestamp: t0 + 200 }],
        activities: [
          {
            id: 'tr-1-0-read_file',
            timestamp: t0 + 200,
            toolName: 'read_file',
            status: 'reading',
            summary: 'Membaca a.ts',
            targetPath: 'D:\\Proj\\src\\a.ts',
            fileAction: 'read',
          },
        ],
        lastStatus: 'idle',
        lastTimestamp: t0 + 200,
      }),
      t0 + 200,
    );

    // Within 15s: ghost-failed is suppressed immediately, empty-stub still within grace window, worked-then-failed visible
    const snapEarly = store.getSnapshot({ now: t0 + 5_000 });
    expect(snapEarly.agents['ghost-failed']).toBeUndefined();
    expect(snapEarly.agents['worked-then-failed']).toBeDefined();
    expect(snapEarly.agents['empty-stub']).toBeDefined();

    // After >15s: empty-stub with 0 files/0 activity/no hooks is suppressed
    const snapLate = store.getSnapshot({ now: t0 + 20_000 });
    expect(snapLate.agents['ghost-failed']).toBeUndefined();
    expect(snapLate.agents['empty-stub']).toBeUndefined();
    expect(snapLate.agents['worked-then-failed']).toBeDefined();
    expect(snapLate.clusters[0].agentIds).toEqual(['lead-1', 'worked-then-failed']);
  });

  it('supports hideAgent, unhideAllAgents, lead promotion, cluster dropping, and auto-unhiding on live PreToolUse hook', () => {
    const store = new StateStore();
    const t0 = 1_700_000_000_000;

    store.applyHookEvent(
      { hookEventName: 'SessionStart', conversationId: 'lead-1', workspacePaths: ['D:\\Proj'] },
      t0,
    );
    store.applyTranscriptDelta(
      'lead-1',
      emptyDelta({
        subagentLinks: [
          { childConversationId: 'sub-1', role: 'Backend Dev', workspacePaths: ['D:\\Proj'], timestamp: t0 + 50 },
        ],
        lastTimestamp: t0 + 50,
      }),
      t0 + 50,
    );
    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'sub-1',
        toolCall: { id: 't1', name: 'read_file', args: { Path: 'D:\\Proj\\a.ts' } },
      },
      t0 + 100,
    );

    // Rejects invalid / prototype-pollution agentId
    expect(store.hideAgent('')).toBe(false);
    expect(store.hideAgent('__proto__')).toBe(false);

    // Hiding lead-1 promotes sub-1 as leadAgentId
    expect(store.hideAgent('lead-1')).toBe(true);
    const snapPromoted = store.getSnapshot({ now: t0 + 200 });
    expect(snapPromoted.hiddenCount).toBe(1);
    expect(snapPromoted.agents['lead-1']).toBeUndefined();
    expect(snapPromoted.clusters).toHaveLength(1);
    expect(snapPromoted.clusters[0].leadAgentId).toBe('sub-1');
    expect(snapPromoted.clusters[0].agentIds).toEqual(['sub-1']);
    expect(store.getBuildingConfig().hiddenAgents).toEqual(['lead-1']);

    // Hiding sub-1 too drops the cluster completely
    expect(store.hideAgent('sub-1')).toBe(true);
    const snapEmpty = store.getSnapshot({ now: t0 + 300 });
    expect(snapEmpty.hiddenCount).toBe(2);
    expect(snapEmpty.clusters).toHaveLength(0);
    expect(Object.keys(snapEmpty.agents)).toHaveLength(0);

    // Receiving a live PreToolUse hook auto-unhides lead-1
    expect(store.isAgentHidden('lead-1')).toBe(true);
    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'lead-1',
        toolCall: { id: 't2', name: 'edit_file', args: { Path: 'D:\\Proj\\b.ts' } },
      },
      t0 + 400,
    );
    expect(store.isAgentHidden('lead-1')).toBe(false);
    const snapWoken = store.getSnapshot({ now: t0 + 500 });
    expect(snapWoken.hiddenCount).toBe(1);
    expect(snapWoken.agents['lead-1']).toBeDefined();
    expect(snapWoken.agents['sub-1']).toBeUndefined();

    // Pulses targeting a hidden agent are excluded from activePulses
    store.applyHookEvent(
      {
        hookEventName: 'PreToolUse',
        conversationId: 'lead-1',
        toolCall: { id: 'm1', name: 'send_message', args: { Recipient: 'sub-1', Message: 'ping' } },
      },
      t0 + 550,
    );
    expect(store.getSnapshot({ now: t0 + 560 }).activePulses).toHaveLength(0);

    // unhideAllAgents restores remaining hidden agents and returns previous count
    expect(store.unhideAllAgents()).toBe(1);
    expect(store.unhideAllAgents()).toBe(0);
    const snapRestored = store.getSnapshot({ now: t0 + 600 });
    expect(snapRestored.hiddenCount).toBe(0);
    expect(snapRestored.agents['lead-1']).toBeDefined();
    expect(snapRestored.agents['sub-1']).toBeDefined();
    expect(snapRestored.activePulses).toHaveLength(2);
  });
});

describe('DemoSimulator', () => {
  it('produces a valid 2-floor, 2-project OfficeSnapshot with main + subagent clusters and advances on tick', () => {
    const sim = new DemoSimulator();
    const snap1 = sim.getSnapshot();
    expect(snap1.demoMode).toBe(true);
    expect(snap1.floors).toHaveLength(2);
    expect(snap1.floors[0]).toMatchObject({ id: 'demo-floor-1', name: 'Core Office', theme: 'engineering' });
    expect(snap1.floors[1]).toMatchObject({ id: 'demo-floor-2', name: 'Mobile Lab', theme: 'creative' });
    expect(snap1.clusters).toHaveLength(2);
    expect(snap1.clusters[0].floorId).not.toBe(snap1.clusters[1].floorId);
    expect(Object.keys(snap1.agents).length).toBeGreaterThanOrEqual(4);

    const added = sim.addFloor('Lounge', 'pantry');
    expect(added).toMatchObject({ index: 3, name: 'Lounge', theme: 'pantry' });
    expect(sim.setFloorTheme('demo-floor-1', 'lobby')).toBe(true);
    expect(sim.getSnapshot().floors[0].theme).toBe('lobby');
    expect(sim.setFloorTheme('demo-floor-1', 'bad' as never)).toBe(false);
    expect(sim.setFloorTheme('missing', 'pantry')).toBe(false);

    // Deleting middle floor preserves remaining floors' chosen themes
    expect(sim.deleteFloor('demo-floor-2')).toBe(true);
    expect(sim.getSnapshot().floors.map((f) => ({ id: f.id, index: f.index, theme: f.theme }))).toEqual([
      { id: 'demo-floor-1', index: 1, theme: 'lobby' },
      { id: added!.id, index: 2, theme: 'pantry' },
    ]);

    // Hiding lead promotes remaining subagents, hiding all drops clusters, and unhideAll restores everything
    expect(sim.hideAgent('__proto__')).toBe(false);
    expect(sim.hideAgent('demo-lead-1')).toBe(true);
    const afterLeadHide = sim.getSnapshot();
    expect(afterLeadHide.hiddenCount).toBe(1);
    expect(afterLeadHide.agents['demo-lead-1']).toBeUndefined();
    expect(afterLeadHide.clusters.find((c) => c.rootId === 'demo-lead-1')).toMatchObject({
      leadAgentId: 'demo-sub-1',
      agentIds: ['demo-sub-1', 'demo-sub-2'],
    });
    expect(sim.hideAgent('demo-sub-1')).toBe(true);
    expect(sim.hideAgent('demo-sub-2')).toBe(true);
    expect(sim.hideAgent('demo-lead-2')).toBe(true);
    expect(sim.getSnapshot().clusters).toHaveLength(0);
    expect(sim.getSnapshot().hiddenCount).toBe(4);
    expect(sim.unhideAllAgents()).toBe(4);
    expect(sim.getSnapshot().hiddenCount).toBe(0);
    expect(sim.getSnapshot().clusters).toHaveLength(2);
    expect(sim.getSnapshot().agents['demo-lead-1']).toBeDefined();

    const snap2 = sim.step();
    expect(snap2.generatedAt).toBeGreaterThanOrEqual(snap1.generatedAt);
  });
});
