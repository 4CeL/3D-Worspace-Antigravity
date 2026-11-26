import React, { StrictMode } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AgentNode } from '@office/shared';
import { TopBar } from '../ui/TopBar';
import { InspectorDrawer } from '../ui/InspectorDrawer';
import { useOfficeSocket } from '../hooks/useOfficeSocket';
import { filterSnapshotForView } from '../ui/filterSnapshot';

afterEach(() => {
  cleanup();
});

const leadAgent: AgentNode = {
  id: 'lead-1',
  parentId: null,
  rootId: 'lead-1',
  isSubagent: false,
  displayName: 'Bangun Kantor 3D',
  role: 'Main Agent',
  modelName: 'gemini-4-neon',
  workspacePath: 'D:\\Projects\\3D Workspace',
  projectName: '3D Workspace',
  status: 'editing',
  focusText: 'Mengedit OfficeCanvas.tsx',
  currentFile: {
    fileName: 'OfficeCanvas.tsx',
    path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\OfficeCanvas.tsx',
    action: 'edit',
  },
  files: [
    {
      path: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\OfficeCanvas.tsx',
      relativePath: 'client/src/scene/OfficeCanvas.tsx',
      fileName: 'OfficeCanvas.tsx',
      action: 'edit',
      lastTouchedAt: Date.now() - 2000,
      count: 3,
    },
    {
      path: 'D:\\Projects\\3D Workspace\\server\\src\\stateStore.ts',
      relativePath: 'server/src/stateStore.ts',
      fileName: 'stateStore.ts',
      action: 'read',
      lastTouchedAt: Date.now() - 10000,
      count: 1,
    },
  ],
  recentActivity: [
    {
      id: 'a1',
      timestamp: Date.now() - 2000,
      toolName: 'edit_file',
      status: 'editing',
      summary: 'Mengedit OfficeCanvas.tsx',
      targetPath: 'D:\\Projects\\3D Workspace\\client\\src\\scene\\OfficeCanvas.tsx',
      fileAction: 'edit',
    },
  ],
  lastUpdatedAt: Date.now(),
  createdAt: Date.now() - 60000,
};

const subAgent: AgentNode = {
  ...leadAgent,
  id: 'sub-1',
  parentId: 'lead-1',
  isSubagent: true,
  displayName: 'API Researcher',
  role: 'API Researcher',
  status: 'reading',
};

describe('TopBar', () => {
  it('displays active count, project filters, hook setup popover, and fires toggle callbacks', () => {
    const onToggleLabels = vi.fn();
    const onToggleHideFinished = vi.fn();
    const onToggleDemo = vi.fn();
    const onResetCamera = vi.fn();
    const onSelectProject = vi.fn();
    const onChangeRecency = vi.fn();

    render(
      <TopBar
        activeCount={2}
        totalCount={3}
        connected={true}
        hookActive={false}
        demoMode={false}
        projects={['3D Workspace', 'Mobile App']}
        selectedProject="ALL"
        recency="30m"
        showLabels={true}
        hideFinished={false}
        onSelectProject={onSelectProject}
        onChangeRecency={onChangeRecency}
        onToggleLabels={onToggleLabels}
        onToggleHideFinished={onToggleHideFinished}
        onToggleDemo={onToggleDemo}
        onResetCamera={onResetCamera}
      />,
    );

    expect(screen.getByText(/2 Aktif/i)).toBeInTheDocument();
    expect(screen.getByText(/Transcript Only/i)).toBeInTheDocument();

    // Open hook setup popover
    fireEvent.click(screen.getByText(/Transcript Only/i));
    expect(screen.getByText(/npm run setup-hooks/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Label File/i }));
    expect(onToggleLabels).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Mode Simulasi/i }));
    expect(onToggleDemo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Reset Kamera/i }));
    expect(onResetCamera).toHaveBeenCalledTimes(1);
  });
});

describe('InspectorDrawer', () => {
  it('renders agent files with EDIT/READ badges, clickable teammate chip, and closes on Escape', () => {
    const onClose = vi.fn();
    const onFocusAgent = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <InspectorDrawer
        agent={leadAgent}
        allAgents={{ [leadAgent.id]: leadAgent, [subAgent.id]: subAgent }}
        onClose={onClose}
        onFocusAgent={onFocusAgent}
      />,
    );

    expect(screen.getByText('Bangun Kantor 3D')).toBeInTheDocument();
    expect(screen.getByText('OfficeCanvas.tsx')).toBeInTheDocument();
    expect(screen.getByText('stateStore.ts')).toBeInTheDocument();
    expect(screen.getByText('EDIT')).toBeInTheDocument();
    expect(screen.getByText('READ')).toBeInTheDocument();

    // Click teammate subagent chip
    fireEvent.click(screen.getByRole('button', { name: /API Researcher/i }));
    expect(onFocusAgent).toHaveBeenCalledWith('sub-1');

    // Click Copy Path button
    const copyBtns = screen.getAllByTitle(/Salin path lengkap/i);
    fireEvent.click(copyBtns[0]);
    expect(writeText).toHaveBeenCalledWith(
      'D:\\Projects\\3D Workspace\\client\\src\\scene\\OfficeCanvas.tsx',
    );

    // Close via Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useOfficeSocket StrictMode guard', () => {
  it('keeps active WebSocket reference and sends set_recency even when stale first mount socket closes later', () => {
    const sockets: Array<{
      readyState: number;
      sent: string[];
      onopen: (() => void) | null;
      onclose: (() => void) | null;
      onmessage: ((ev: { data: string }) => void) | null;
      onerror: (() => void) | null;
      send: (d: string) => void;
      close: () => void;
    }> = [];

    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      send(d: string) {
        this.sent.push(d);
      }
      close() {
        this.readyState = 3;
      }
    }

    const origWs = globalThis.WebSocket;
    Object.defineProperty(globalThis, 'WebSocket', { value: FakeWebSocket, configurable: true });

    let latestRecencyFn: ((r: '30m' | '2h' | 'today') => void) | null = null;
    function Harness() {
      const { connected, setRecency } = useOfficeSocket();
      latestRecencyFn = setRecency;
      return <div data-testid="conn">{connected ? 'yes' : 'no'}</div>;
    }

    try {
      render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );

      expect(sockets.length).toBeGreaterThanOrEqual(2);
      const firstWs = sockets[0];
      const activeWs = sockets[sockets.length - 1];

      act(() => {
        activeWs.onopen?.();
      });
      expect(screen.getByTestId('conn').textContent).toBe('yes');

      // Stale first socket finishes closing asynchronously AFTER second socket opened
      act(() => {
        firstWs.onclose?.();
      });
      expect(screen.getByTestId('conn').textContent).toBe('yes');

      act(() => {
        latestRecencyFn?.('2h');
      });
      expect(activeWs.sent.some((s) => s.includes('"set_recency"') && s.includes('"2h"'))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', { value: origWs, configurable: true });
    }
  });
});

describe('filterSnapshotForView', () => {
  it('falls back to ALL when selectedProject disappears (e.g. leaving Demo Mode) and promotes active lead under hideFinished', () => {
    const idleLead: AgentNode = { ...leadAgent, status: 'idle' };
    const activeSub: AgentNode = { ...subAgent, status: 'reading' };
    const snap = {
      generatedAt: Date.now(),
      hookActive: true,
      lastHookAt: Date.now(),
      demoMode: false,
      clusters: [
        {
          rootId: idleLead.id,
          projectName: '3D Workspace',
          title: idleLead.displayName,
          leadAgentId: idleLead.id,
          agentIds: [idleLead.id, activeSub.id],
          lastUpdatedAt: Date.now(),
        },
      ],
      agents: { [idleLead.id]: idleLead, [activeSub.id]: activeSub },
      activePulses: [],
    };

    const result = filterSnapshotForView(snap, 'Mobile Commerce', true);
    expect(result.effectiveProject).toBe('ALL');
    expect(result.snapshot.clusters).toHaveLength(1);
    expect(result.snapshot.clusters[0].agentIds).toEqual([activeSub.id]);
    expect(result.snapshot.clusters[0].leadAgentId).toBe(activeSub.id);
  });
});
