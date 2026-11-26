import type {
  ActivePulse,
  AgentNode,
  AgentStatus,
  FileAction,
  FloorConfig,
  FloorTheme,
  OfficeSnapshot,
  TeamCluster,
} from '@office/shared';
import {
  MAX_FLOORS,
  MAX_TEAM_FLOORS,
  defaultThemeForFloorIndex,
  isSafeObjectKey,
  isValidFloorTheme,
} from './buildingStore.js';

interface DemoPhase {
  leadStatus: AgentStatus;
  leadFile?: { fileName: string; path: string; action: FileAction };
  leadSummary: string;
  sub1Status: AgentStatus;
  sub1File?: { fileName: string; path: string; action: FileAction };
  sub1Summary: string;
  sub2Status: AgentStatus;
  sub2File?: { fileName: string; path: string; action: FileAction };
  sub2Summary: string;
  pulse?: { from: string; to: string };
}

const PHASES: DemoPhase[] = [
  {
    leadStatus: 'editing',
    leadFile: { fileName: 'OfficeCanvas.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\OfficeCanvas.tsx', action: 'edit' },
    leadSummary: 'Mengedit OfficeCanvas.tsx',
    sub1Status: 'reading',
    sub1File: { fileName: 'stateStore.ts', path: 'D:\\Projects\\3D Workspace\\server\\src\\stateStore.ts', action: 'read' },
    sub1Summary: 'Membaca stateStore.ts',
    sub2Status: 'running',
    sub2Summary: 'Menjalankan vitest suite',
    pulse: { from: 'demo-lead-1', to: 'demo-sub-1' },
  },
  {
    leadStatus: 'delegating',
    leadFile: { fileName: 'InspectorDrawer.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\ui\\InspectorDrawer.tsx', action: 'write' },
    leadSummary: 'Koordinasi update inspector UI',
    sub1Status: 'editing',
    sub1File: { fileName: 'transcriptParser.ts', path: 'D:\\Projects\\3D Workspace\\server\\src\\transcriptParser.ts', action: 'edit' },
    sub1Summary: 'Mengedit transcriptParser.ts',
    sub2Status: 'reading',
    sub2File: { fileName: 'TopBar.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\ui\\TopBar.tsx', action: 'read' },
    sub2Summary: 'Membaca TopBar.tsx',
    pulse: { from: 'demo-lead-1', to: 'demo-sub-2' },
  },
  {
    leadStatus: 'thinking',
    leadFile: { fileName: 'officeLayout.ts', path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\officeLayout.ts', action: 'read' },
    leadSummary: 'Menyusun layout klaster meja',
    sub1Status: 'running',
    sub1Summary: 'npm run build --workspace=server',
    sub2Status: 'editing',
    sub2File: { fileName: 'AgentDesk.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\AgentDesk.tsx', action: 'edit' },
    sub2Summary: 'Mengedit AgentDesk.tsx',
  },
  {
    leadStatus: 'editing',
    leadFile: { fileName: 'App.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\App.tsx', action: 'edit' },
    leadSummary: 'Mengedit App.tsx',
    sub1Status: 'idle',
    sub1File: { fileName: 'stateStore.ts', path: 'D:\\Projects\\3D Workspace\\server\\src\\stateStore.ts', action: 'edit' },
    sub1Summary: 'Selesai · Istirahat kopi',
    sub2Status: 'reading',
    sub2File: { fileName: 'AgentAvatar.tsx', path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\AgentAvatar.tsx', action: 'read' },
    sub2Summary: 'Membaca AgentAvatar.tsx',
    pulse: { from: 'demo-sub-1', to: 'demo-lead-1' },
  },
];

export class DemoSimulator {
  private tickIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly customAliases = new Map<string, string>();
  private readonly floors: FloorConfig[] = [
    { id: 'demo-floor-1', index: 1, name: 'Core Office', theme: 'engineering' },
    { id: 'demo-floor-2', index: 2, name: 'Mobile Lab', theme: 'creative' },
  ];
  private readonly teamFloors = new Map<string, string>([
    ['demo-lead-1', 'demo-floor-1'],
    ['demo-lead-2', 'demo-floor-2'],
  ]);
  private snapshot: OfficeSnapshot;

  constructor() {
    this.snapshot = this.buildSnapshot(Date.now());
  }

  addFloor(name?: string, theme?: FloorTheme): FloorConfig | null {
    if (this.floors.length >= MAX_FLOORS) return null;
    const nextIndex = this.floors.length + 1;
    let id = `demo-floor-${nextIndex}`;
    while (this.floors.some((f) => f.id === id)) {
      id = `demo-floor-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    const label =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : `Lantai ${nextIndex}`;
    const resolvedTheme: FloorTheme = isValidFloorTheme(theme)
      ? theme
      : defaultThemeForFloorIndex(nextIndex);
    const floor: FloorConfig = { id, index: nextIndex, name: label, theme: resolvedTheme };
    this.floors.push(floor);
    this.snapshot = this.buildSnapshot(Date.now());
    return floor;
  }

  renameFloor(floorId: string, name: string): boolean {
    const target = this.floors.find((f) => f.id === floorId);
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!target || !trimmed) return false;
    target.name = trimmed;
    this.snapshot = this.buildSnapshot(Date.now());
    return true;
  }

  setFloorTheme(floorId: string, theme: FloorTheme): boolean {
    const target = this.floors.find((f) => f.id === floorId);
    if (!target || !isValidFloorTheme(theme)) return false;
    target.theme = theme;
    this.snapshot = this.buildSnapshot(Date.now());
    return true;
  }

  deleteFloor(floorId: string): boolean {
    const idx = this.floors.findIndex((f) => f.id === floorId);
    if (idx <= 0 || this.floors.length <= 1) return false;
    const fallback = this.floors[0].id;
    this.floors.splice(idx, 1);
    this.floors.forEach((f, i) => {
      f.index = i + 1;
    });
    for (const [rootId, fid] of this.teamFloors.entries()) {
      if (fid === floorId) this.teamFloors.set(rootId, fallback);
    }
    this.snapshot = this.buildSnapshot(Date.now());
    return true;
  }

  setTeamFloor(rootId: string, floorId: string): boolean {
    const trimmedRoot = typeof rootId === 'string' ? rootId.trim() : '';
    if (!isSafeObjectKey(trimmedRoot) || !this.floors.some((f) => f.id === floorId)) return false;
    if (!this.teamFloors.has(trimmedRoot) && this.teamFloors.size >= MAX_TEAM_FLOORS) {
      const oldestKey = this.teamFloors.keys().next().value;
      if (oldestKey) this.teamFloors.delete(oldestKey);
    }
    this.teamFloors.set(trimmedRoot, floorId);
    this.snapshot = this.buildSnapshot(Date.now());
    return true;
  }

  setAgentAlias(agentId: string, name: string | null): OfficeSnapshot {
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 60) : '';
    if (trimmed) {
      this.customAliases.set(agentId, trimmed);
    } else {
      this.customAliases.delete(agentId);
    }
    this.snapshot = this.buildSnapshot(Date.now());
    return this.snapshot;
  }

  start(onTick: (snapshot: OfficeSnapshot) => void, intervalMs = 2800): void {
    this.stop();
    this.snapshot = this.buildSnapshot(Date.now());
    onTick(this.snapshot);
    this.timer = setInterval(() => {
      const next = this.step();
      onTick(next);
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  step(now = Date.now()): OfficeSnapshot {
    this.tickIndex = (this.tickIndex + 1) % PHASES.length;
    this.snapshot = this.buildSnapshot(now);
    return this.snapshot;
  }

  getSnapshot(): OfficeSnapshot {
    return this.snapshot;
  }

  private buildSnapshot(now: number): OfficeSnapshot {
    const phase = PHASES[this.tickIndex];
    const ws1 = 'D:\\Projects\\3D Workspace';
    const ws2 = 'D:\\Projects\\Mobile Commerce';

    const lead1: AgentNode = {
      id: 'demo-lead-1',
      parentId: null,
      rootId: 'demo-lead-1',
      isSubagent: false,
      displayName: 'Bangun Kantor 3D Agent',
      role: 'Main Agent',
      modelName: 'gemini-4-neon',
      workspacePath: ws1,
      projectName: '3D Workspace',
      status: phase.leadStatus,
      focusText: phase.leadSummary,
      currentTool: phase.leadStatus === 'editing' ? 'edit_file' : 'update_focus',
      currentFile: phase.leadFile,
      files: [
        {
          path: `${ws1}\\client\\src\\scene\\OfficeCanvas.tsx`,
          relativePath: 'client/src/scene/OfficeCanvas.tsx',
          fileName: 'OfficeCanvas.tsx',
          action: 'edit',
          lastTouchedAt: now - 2000,
          count: 4,
        },
        {
          path: `${ws1}\\client\\src\\ui\\InspectorDrawer.tsx`,
          relativePath: 'client/src/ui/InspectorDrawer.tsx',
          fileName: 'InspectorDrawer.tsx',
          action: 'write',
          lastTouchedAt: now - 15000,
          count: 2,
        },
        {
          path: `${ws1}\\client\\src\\App.tsx`,
          relativePath: 'client/src/App.tsx',
          fileName: 'App.tsx',
          action: 'edit',
          lastTouchedAt: now - 45000,
          count: 3,
        },
      ],
      recentActivity: [
        {
          id: `demo-a1-${this.tickIndex}`,
          timestamp: now,
          toolName: phase.leadStatus === 'editing' ? 'edit_file' : 'update_focus',
          status: phase.leadStatus,
          summary: phase.leadSummary,
          targetPath: phase.leadFile?.path,
          fileAction: phase.leadFile?.action,
        },
        {
          id: 'demo-a1-prev',
          timestamp: now - 18000,
          toolName: 'invoke_subagent',
          status: 'delegating',
          summary: 'Mendelegasikan ke Backend Telemetry',
        },
      ],
      lastUpdatedAt: now,
      lastHookAt: now,
      createdAt: now - 600_000,
    };

    const sub1: AgentNode = {
      id: 'demo-sub-1',
      parentId: 'demo-lead-1',
      rootId: 'demo-lead-1',
      isSubagent: true,
      displayName: 'Backend Telemetry',
      role: 'Backend Telemetry',
      typeName: 'research',
      modelName: 'gemini-4-flash',
      workspacePath: ws1,
      projectName: '3D Workspace',
      status: phase.sub1Status,
      focusText: phase.sub1Summary,
      currentTool: phase.sub1Status === 'running' ? 'run_command' : 'read_file',
      currentFile: phase.sub1File,
      files: [
        {
          path: `${ws1}\\server\\src\\stateStore.ts`,
          relativePath: 'server/src/stateStore.ts',
          fileName: 'stateStore.ts',
          action: 'edit',
          lastTouchedAt: now - 4000,
          count: 3,
        },
        {
          path: `${ws1}\\server\\src\\transcriptParser.ts`,
          relativePath: 'server/src/transcriptParser.ts',
          fileName: 'transcriptParser.ts',
          action: 'read',
          lastTouchedAt: now - 28000,
          count: 2,
        },
      ],
      recentActivity: [
        {
          id: `demo-s1-${this.tickIndex}`,
          timestamp: now,
          toolName: phase.sub1Status === 'running' ? 'run_command' : 'read_file',
          status: phase.sub1Status,
          summary: phase.sub1Summary,
          targetPath: phase.sub1File?.path,
          fileAction: phase.sub1File?.action,
        },
      ],
      lastUpdatedAt: now,
      lastHookAt: now,
      createdAt: now - 540_000,
    };

    const sub2: AgentNode = {
      id: 'demo-sub-2',
      parentId: 'demo-lead-1',
      rootId: 'demo-lead-1',
      isSubagent: true,
      displayName: '3D Scene Artisan',
      role: '3D Scene Artisan',
      typeName: 'self',
      modelName: 'gemini-4-neon',
      workspacePath: ws1,
      projectName: '3D Workspace',
      status: phase.sub2Status,
      focusText: phase.sub2Summary,
      currentTool: phase.sub2Status === 'running' ? 'run_command' : 'edit_file',
      currentFile: phase.sub2File,
      files: [
        {
          path: `${ws1}\\client\\src\\scene\\AgentDesk.tsx`,
          relativePath: 'client/src/scene/AgentDesk.tsx',
          fileName: 'AgentDesk.tsx',
          action: 'edit',
          lastTouchedAt: now - 3000,
          count: 5,
        },
        {
          path: `${ws1}\\client\\src\\ui\\TopBar.tsx`,
          relativePath: 'client/src/ui/TopBar.tsx',
          fileName: 'TopBar.tsx',
          action: 'read',
          lastTouchedAt: now - 22000,
          count: 1,
        },
      ],
      recentActivity: [
        {
          id: `demo-s2-${this.tickIndex}`,
          timestamp: now,
          toolName: phase.sub2Status === 'running' ? 'run_command' : 'edit_file',
          status: phase.sub2Status,
          summary: phase.sub2Summary,
          targetPath: phase.sub2File?.path,
          fileAction: phase.sub2File?.action,
        },
      ],
      lastUpdatedAt: now,
      lastHookAt: now,
      createdAt: now - 480_000,
    };

    const lead2: AgentNode = {
      id: 'demo-lead-2',
      parentId: null,
      rootId: 'demo-lead-2',
      isSubagent: false,
      displayName: 'Fix Checkout Payment',
      role: 'Main Agent',
      modelName: 'gemini-4-flash',
      workspacePath: ws2,
      projectName: 'Mobile Commerce',
      status: 'idle',
      focusText: 'Selesai · Menunggu review',
      currentFile: {
        fileName: 'checkout.dart',
        path: `${ws2}\\lib\\checkout.dart`,
        action: 'edit',
      },
      files: [
        {
          path: `${ws2}\\lib\\checkout.dart`,
          relativePath: 'lib/checkout.dart',
          fileName: 'checkout.dart',
          action: 'edit',
          lastTouchedAt: now - 180_000,
          count: 2,
        },
        {
          path: `${ws2}\\test\\checkout_test.dart`,
          relativePath: 'test/checkout_test.dart',
          fileName: 'checkout_test.dart',
          action: 'write',
          lastTouchedAt: now - 150_000,
          count: 1,
        },
      ],
      recentActivity: [
        {
          id: 'demo-l2-1',
          timestamp: now - 150_000,
          toolName: 'run_command',
          status: 'running',
          summary: 'flutter test test/checkout_test.dart',
        },
      ],
      lastUpdatedAt: now - 140_000,
      lastHookAt: now - 140_000,
      createdAt: now - 900_000,
    };

    const applyAlias = (agent: AgentNode): AgentNode => {
      const alias = this.customAliases.get(agent.id);
      return alias
        ? { ...agent, displayName: alias, hasCustomAlias: true }
        : { ...agent, hasCustomAlias: false };
    };

    const finalLead1 = applyAlias(lead1);
    const finalSub1 = applyAlias(sub1);
    const finalSub2 = applyAlias(sub2);
    const finalLead2 = applyAlias(lead2);

    const resolveFloor = (rootId: string): string => {
      const assigned = this.teamFloors.get(rootId);
      return assigned && this.floors.some((f) => f.id === assigned)
        ? assigned
        : this.floors[0].id;
    };

    const clusters: TeamCluster[] = [
      {
        rootId: 'demo-lead-1',
        projectName: '3D Workspace',
        workspacePath: ws1,
        title: finalLead1.displayName,
        leadAgentId: 'demo-lead-1',
        agentIds: ['demo-lead-1', 'demo-sub-1', 'demo-sub-2'],
        floorId: resolveFloor('demo-lead-1'),
        lastUpdatedAt: now,
      },
      {
        rootId: 'demo-lead-2',
        projectName: 'Mobile Commerce',
        workspacePath: ws2,
        title: finalLead2.displayName,
        leadAgentId: 'demo-lead-2',
        agentIds: ['demo-lead-2'],
        floorId: resolveFloor('demo-lead-2'),
        lastUpdatedAt: now - 140_000,
      },
    ];

    const activePulses: ActivePulse[] = phase.pulse
      ? [
          {
            id: `demo-pulse-${this.tickIndex}`,
            fromAgentId: phase.pulse.from,
            toAgentId: phase.pulse.to,
            timestamp: now,
          },
        ]
      : [];

    return {
      generatedAt: now,
      hookActive: true,
      lastHookAt: now,
      demoMode: true,
      floors: this.floors.map((f) => ({ ...f })),
      clusters,
      agents: {
        [finalLead1.id]: finalLead1,
        [finalSub1.id]: finalSub1,
        [finalSub2.id]: finalSub2,
        [finalLead2.id]: finalLead2,
      },
      activePulses,
    };
  }
}
