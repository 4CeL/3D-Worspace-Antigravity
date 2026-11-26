import React, { StrictMode } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AgentNode } from '@office/shared';
import { TopBar } from '../ui/TopBar';
import { InspectorDrawer } from '../ui/InspectorDrawer';
import { FloorElevator } from '../ui/FloorElevator';
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

  it('supports inline renaming of an agent and cancels edit on Escape without closing drawer', () => {
    const onClose = vi.fn();
    const onRenameAgent = vi.fn();

    render(
      <InspectorDrawer
        agent={{ ...leadAgent, hasCustomAlias: true }}
        allAgents={{ [leadAgent.id]: leadAgent, [subAgent.id]: subAgent }}
        onClose={onClose}
        onFocusAgent={vi.fn()}
        onRenameAgent={onRenameAgent}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ganti nama agent/i }));
    const input = screen.getByLabelText(/Nama agent baru/i);
    fireEvent.change(input, { target: { value: 'Arsitek Utama' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    // Escape cancels editing without closing the inspector drawer
    expect(onClose).not.toHaveBeenCalled();

    // Rename and submit via Enter
    fireEvent.click(screen.getByRole('button', { name: /Ganti nama agent/i }));
    const input2 = screen.getByLabelText(/Nama agent baru/i);
    fireEvent.change(input2, { target: { value: 'Arsitek Utama' } });
    fireEvent.keyDown(input2, { key: 'Enter' });
    expect(onRenameAgent).toHaveBeenCalledWith('lead-1', 'Arsitek Utama');

    // Reset button clears custom alias
    fireEvent.click(screen.getByRole('button', { name: /Reset nama/i }));
    expect(onRenameAgent).toHaveBeenCalledWith('lead-1', null);
  });

  it('allows moving the agent team to another floor via the Lantai Gedung dropdown', () => {
    const onMoveTeamFloor = vi.fn();
    render(
      <InspectorDrawer
        agent={leadAgent}
        allAgents={{ [leadAgent.id]: leadAgent, [subAgent.id]: subAgent }}
        floors={[
          { id: 'floor-1', index: 1, name: 'Lantai 1' },
          { id: 'floor-2', index: 2, name: 'Mobile Lab' },
        ]}
        currentFloorId="floor-1"
        onClose={vi.fn()}
        onFocusAgent={vi.fn()}
        onMoveTeamFloor={onMoveTeamFloor}
      />,
    );

    const select = screen.getByLabelText(/Lantai Tim/i);
    fireEvent.change(select, { target: { value: 'floor-2' } });
    expect(onMoveTeamFloor).toHaveBeenCalledWith('lead-1', 'floor-2');
  });
});

describe('FloorElevator', () => {
  it('renders floors top-to-bottom, triggers focus, addFloor, and deleteFloor for floors above Floor 1', () => {
    const onSelectFloor = vi.fn();
    const onAddFloor = vi.fn();
    const onRenameFloor = vi.fn();
    const onDeleteFloor = vi.fn();

    render(
      <FloorElevator
        floors={[
          { id: 'floor-1', index: 1, name: 'Core Office' },
          { id: 'floor-2', index: 2, name: 'Mobile Lab' },
        ]}
        focusedFloorIndex={null}
        floorStats={{
          'floor-1': { active: 2, total: 3 },
          'floor-2': { active: 1, total: 1 },
        }}
        onSelectFloor={onSelectFloor}
        onAddFloor={onAddFloor}
        onRenameFloor={onRenameFloor}
        onDeleteFloor={onDeleteFloor}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tambah Lantai/i }));
    expect(onAddFloor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /L2/i }));
    expect(onSelectFloor).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /Semua/i }));
    expect(onSelectFloor).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: /Hapus Lantai 2/i }));
    expect(onDeleteFloor).toHaveBeenCalledWith('floor-2');
  });

  it('renders per-floor theme selectors and calls onChangeFloorTheme when changed', () => {
    const onChangeFloorTheme = vi.fn();

    render(
      <FloorElevator
        floors={[
          { id: 'floor-1', index: 1, name: 'Core Office', theme: 'engineering' },
          { id: 'floor-2', index: 2, name: 'Lounge Area' },
        ]}
        focusedFloorIndex={1}
        floorStats={{
          'floor-1': { active: 1, total: 2 },
          'floor-2': { active: 0, total: 1 },
        }}
        onSelectFloor={vi.fn()}
        onAddFloor={vi.fn()}
        onRenameFloor={vi.fn()}
        onDeleteFloor={vi.fn()}
        onChangeFloorTheme={onChangeFloorTheme}
      />,
    );

    const floor1Theme = screen.getByLabelText(/Tema Lantai 1/i) as HTMLSelectElement;
    const floor2Theme = screen.getByLabelText(/Tema Lantai 2/i) as HTMLSelectElement;

    expect(floor1Theme.value).toBe('engineering');
    // Fallback cycle assigns 'lobby' to Floor 2 when theme is omitted
    expect(floor2Theme.value).toBe('lobby');

    fireEvent.change(floor2Theme, { target: { value: 'pantry' } });
    expect(onChangeFloorTheme).toHaveBeenCalledWith('floor-2', 'pantry');

    fireEvent.change(floor1Theme, { target: { value: 'creative' } });
    expect(onChangeFloorTheme).toHaveBeenCalledWith('floor-1', 'creative');
  });

  it('handles omitted onChangeFloorTheme and undefined floor.theme without throwing or selecting floor', () => {
    const onSelectFloor = vi.fn();

    render(
      <FloorElevator
        floors={[
          { id: 'floor-1', index: 1, name: 'Core Office' },
          { id: 'floor-2', index: 2, name: 'Second Floor' },
        ]}
        focusedFloorIndex={null}
        floorStats={{}}
        onSelectFloor={onSelectFloor}
        onAddFloor={vi.fn()}
        onRenameFloor={vi.fn()}
        onDeleteFloor={vi.fn()}
      />,
    );

    const floor1Select = screen.getByLabelText(/Tema Lantai 1/i) as HTMLSelectElement;
    const floor2Select = screen.getByLabelText(/Tema Lantai 2/i) as HTMLSelectElement;
    expect(floor1Select.value).toBe('engineering');
    expect(floor2Select.value).toBe('lobby');

    expect(() => {
      fireEvent.click(floor2Select);
      fireEvent.change(floor2Select, { target: { value: 'creative' } });
    }).not.toThrow();
    expect(onSelectFloor).not.toHaveBeenCalled();
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
      floors: [{ id: 'floor-1', index: 1, name: 'Lantai 1' }],
      clusters: [
        {
          rootId: idleLead.id,
          projectName: '3D Workspace',
          title: idleLead.displayName,
          leadAgentId: idleLead.id,
          agentIds: [idleLead.id, activeSub.id],
          floorId: 'floor-1',
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
