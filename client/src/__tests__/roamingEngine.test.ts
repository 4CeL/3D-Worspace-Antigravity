import { describe, expect, it } from 'vitest';
import type { AgentNode, AgentStatus, FloorConfig, FloorTheme, TeamCluster } from '@office/shared';
import { computeOfficeLayout } from '../scene/officeLayout';
import { RoamingController, computeFloorWaypoints } from '../scene/roamingEngine';

function makeAgent(
  id: string,
  parentId: string | null,
  rootId: string,
  status: AgentStatus = 'idle',
): AgentNode {
  return {
    id,
    parentId,
    rootId,
    isSubagent: parentId !== null,
    displayName: id,
    role: parentId ? 'Subagent' : 'Main Agent',
    projectName: '3D Workspace',
    status,
    files: [],
    recentActivity: [],
    lastUpdatedAt: Date.now(),
    createdAt: Date.now(),
  };
}

function advance(controller: RoamingController, seconds: number, stepSize = 0.1): void {
  const steps = Math.ceil(seconds / stepSize);
  for (let i = 0; i < steps; i++) {
    controller.step(stepSize);
  }
}

describe('computeFloorWaypoints', () => {
  const themes: FloorTheme[] = ['engineering', 'lobby', 'creative', 'pantry'];

  it('keeps all waypoints strictly inside floor bounds with wall and ElevatorCore clearance for every theme', () => {
    const floorWidth = 17;
    const floorDepth = 17;
    const halfW = floorWidth / 2;
    const halfD = floorDepth / 2;
    // ElevatorCore sits at [-halfW + 1.05, -halfD + 0.95] spanning [-halfW + 0.22..-halfW + 1.88, -halfD + 0.17..-halfD + 1.73]
    const elevX = -halfW + 1.05;
    const elevZ = -halfD + 0.95;

    for (const theme of themes) {
      const waypoints = computeFloorWaypoints(floorWidth, floorDepth, theme);
      expect(waypoints.length).toBeGreaterThanOrEqual(5);

      for (const wp of waypoints) {
        // Wall clearance >= 1.5 units
        expect(wp.x).toBeGreaterThanOrEqual(-halfW + 1.5);
        expect(wp.x).toBeLessThanOrEqual(halfW - 1.5);
        expect(wp.z).toBeGreaterThanOrEqual(-halfD + 1.5);
        expect(wp.z).toBeLessThanOrEqual(halfD - 1.5);

        // Safe clearance from ElevatorCore footprint
        const distToElevator = Math.hypot(wp.x - elevX, wp.z - elevZ);
        expect(distToElevator).toBeGreaterThanOrEqual(2.2);
      }
    }
  });
});

describe('RoamingController', () => {
  it('keeps Main Agents seated when idle while idle subagents wait for staggered delay then walk out and visit', () => {
    const floors: FloorConfig[] = [{ id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'lobby' }];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'idle'),
      'sub-alpha': makeAgent('sub-alpha', 'lead-1', 'lead-1', 'idle'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: '3D Workspace',
        title: 'Main',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1', 'sub-alpha'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    // After 2.5s (< 3.0s minimum staggered delay), subagent should still be seated
    advance(controller, 2.5);
    expect(controller.getState('lead-1')?.mode).toBe('seated');
    expect(controller.getState('sub-alpha')?.mode).toBe('seated');
    expect(controller.getRoamingAgentIds().size).toBe(0);

    // By 6.0s (> 5.5s maximum staggered delay), subagent stands up and walks out; lead stays seated
    advance(controller, 3.5);
    expect(controller.getState('lead-1')?.mode).toBe('seated');
    const midState = controller.getState('sub-alpha');
    expect(midState?.mode === 'walking_out' || midState?.mode === 'visiting').toBe(true);
    expect(controller.getRoamingAgentIds().has('sub-alpha')).toBe(true);
    expect(controller.getRoamingAgentIds().has('lead-1')).toBe(false);

    // After walking time, subagent reaches a waypoint and enters visiting
    let sawVisiting = midState?.mode === 'visiting';
    for (let i = 0; i < 120 && !sawVisiting; i++) {
      controller.step(0.1);
      if (controller.getState('sub-alpha')?.mode === 'visiting') {
        sawVisiting = true;
      }
    }
    expect(sawVisiting).toBe(true);
    expect(controller.getState('lead-1')?.mode).toBe('seated');
  });

  it('pairs two idle subagents on the same floor into chatting facing each other with non-clipping spacing and bubbles', () => {
    const floors: FloorConfig[] = [{ id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'pantry' }];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'editing'),
      'sub-1': makeAgent('sub-1', 'lead-1', 'lead-1', 'idle'),
      'sub-2': makeAgent('sub-2', 'lead-1', 'lead-1', 'idle'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: '3D Workspace',
        title: 'Team A',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1', 'sub-1', 'sub-2'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    let paired = false;
    for (let i = 0; i < 300; i++) {
      controller.step(0.1);
      const s1 = controller.getState('sub-1');
      const s2 = controller.getState('sub-2');
      if (s1?.mode === 'chatting' && s2?.mode === 'chatting') {
        // Give them a brief moment to settle onto their exact chat spots
        advance(controller, 1.0);
        paired = true;
        break;
      }
    }

    expect(paired).toBe(true);
    const s1 = controller.getState('sub-1')!;
    const s2 = controller.getState('sub-2')!;
    expect(s1.mode).toBe('chatting');
    expect(s2.mode).toBe('chatting');
    expect(s1.partnerId).toBe('sub-2');
    expect(s2.partnerId).toBe('sub-1');

    // Non-clipping distance >= 0.75
    const spacing = Math.hypot(s2.x - s1.x, s2.z - s1.z);
    expect(spacing).toBeGreaterThanOrEqual(0.75);

    // Facing each other: dot product of unit facing vector with vector toward partner > 0.9
    const dx12 = (s2.x - s1.x) / spacing;
    const dz12 = (s2.z - s1.z) / spacing;
    const face1Dot = Math.sin(s1.rotationY) * dx12 + Math.cos(s1.rotationY) * dz12;
    const face2Dot = Math.sin(s2.rotationY) * -dx12 + Math.cos(s2.rotationY) * -dz12;
    expect(face1Dot).toBeGreaterThan(0.9);
    expect(face2Dot).toBeGreaterThan(0.9);

    // Friendly interaction bubbles emitted
    expect(['💬', '☕', '💡', '👋']).toContain(s1.bubble);
    expect(['💬', '☕', '💡', '👋']).toContain(s2.bubble);
  });

  it('immediately unpairs partner, returns briskly to desk, and snaps back to seated when work resumes', () => {
    const floors: FloorConfig[] = [{ id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'creative' }];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'editing'),
      'sub-1': makeAgent('sub-1', 'lead-1', 'lead-1', 'idle'),
      'sub-2': makeAgent('sub-2', 'lead-1', 'lead-1', 'idle'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: '3D Workspace',
        title: 'Team A',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1', 'sub-1', 'sub-2'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    // Wait until they are chatting
    for (let i = 0; i < 300; i++) {
      controller.step(0.1);
      if (
        controller.getState('sub-1')?.mode === 'chatting' &&
        controller.getState('sub-2')?.mode === 'chatting'
      ) {
        break;
      }
    }
    expect(controller.getState('sub-1')?.mode).toBe('chatting');

    // Assign new editing task to sub-1!
    const updatedAgents: Record<string, AgentNode> = {
      ...agents,
      'sub-1': makeAgent('sub-1', 'lead-1', 'lead-1', 'editing'),
    };
    controller.syncLayout(layout, updatedAgents);

    // Immediately switches to returning and unpairs sub-2 cleanly to visiting
    expect(controller.getState('sub-1')?.mode).toBe('returning');
    expect(controller.getState('sub-1')?.partnerId).toBeNull();
    expect(controller.getState('sub-1')?.bubble).toBeNull();
    expect(controller.getState('sub-2')?.partnerId).toBeNull();
    expect(controller.getState('sub-2')?.mode).toBe('visiting');

    // Walks briskly back to desk and snaps back to seated
    advance(controller, 8.0);
    const seatedState = controller.getState('sub-1')!;
    expect(seatedState.mode).toBe('seated');
    expect(controller.getRoamingAgentIds().has('sub-1')).toBe(false);

    const desk = layout.desks['sub-1'];
    const expectedSeatX = desk.position[0] + 0.56 * Math.sin(desk.rotationY);
    const expectedSeatZ = desk.position[2] + 0.56 * Math.cos(desk.rotationY);
    expect(Math.hypot(seatedState.x - expectedSeatX, seatedState.z - expectedSeatZ)).toBeLessThan(
      0.05,
    );
  });

  it('unpairs chat partner cleanly when a chatting subagent moves floors or is hidden/removed, and ignores NaN dt', () => {
    const floors: FloorConfig[] = [
      { id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'engineering' },
      { id: 'floor-2', index: 2, name: 'Lantai 2', theme: 'lobby' },
    ];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'editing'),
      'sub-1': makeAgent('sub-1', 'lead-1', 'lead-1', 'idle'),
      'lead-2': makeAgent('lead-2', null, 'lead-2', 'editing'),
      'sub-2': makeAgent('sub-2', 'lead-2', 'lead-2', 'idle'),
    };
    const clustersOnFloor1: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: '3D Workspace',
        title: 'Team A',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1', 'sub-1'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
      {
        rootId: 'lead-2',
        projectName: '3D Workspace',
        title: 'Team B',
        leadAgentId: 'lead-2',
        agentIds: ['lead-2', 'sub-2'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout1 = computeOfficeLayout(clustersOnFloor1, agents, floors);
    const controller = new RoamingController();
    controller.syncLayout(layout1, agents);

    // Wait until sub-1 and sub-2 pair up to chat on floor-1
    for (let i = 0; i < 300; i++) {
      controller.step(0.1);
      if (
        controller.getState('sub-1')?.mode === 'chatting' &&
        controller.getState('sub-2')?.mode === 'chatting'
      ) {
        break;
      }
    }
    expect(controller.getState('sub-1')?.partnerId).toBe('sub-2');
    expect(controller.getState('sub-2')?.partnerId).toBe('sub-1');

    // NaN / negative dt must not corrupt positions
    expect(controller.step(Number.NaN)).toBe(false);
    expect(controller.step(-0.5)).toBe(false);
    expect(Number.isFinite(controller.getState('sub-1')!.x)).toBe(true);

    // Move Team B (sub-2) to floor-2 -> sub-2 resets to seated on floor-2, sub-1 unpairs cleanly
    const clustersMoved: TeamCluster[] = [
      clustersOnFloor1[0],
      { ...clustersOnFloor1[1], floorId: 'floor-2' },
    ];
    const layoutMoved = computeOfficeLayout(clustersMoved, agents, floors);
    const sigChangedAfterMove = controller.syncLayout(layoutMoved, agents);
    expect(sigChangedAfterMove).toBe(true);
    expect(controller.getState('sub-2')).toMatchObject({
      floorId: 'floor-2',
      mode: 'seated',
      partnerId: null,
      targetWaypointId: null,
      bubble: null,
    });
    expect(controller.getState('sub-2')!.y).toBeCloseTo(layoutMoved.floors[1].y);
    expect(controller.getState('sub-1')).toMatchObject({
      mode: 'visiting',
      partnerId: null,
      bubble: null,
    });

    // Move Team B back to floor-1, re-pair, then hide/remove sub-1 completely
    controller.syncLayout(layout1, agents);
    for (let i = 0; i < 300; i++) {
      controller.step(0.1);
      if (
        controller.getState('sub-1')?.mode === 'chatting' &&
        controller.getState('sub-2')?.mode === 'chatting'
      ) {
        break;
      }
    }
    expect(controller.getState('sub-2')?.partnerId).toBe('sub-1');

    const agentsWithoutSub1: Record<string, AgentNode> = {
      'lead-1': agents['lead-1'],
      'lead-2': agents['lead-2'],
      'sub-2': agents['sub-2'],
    };
    const clustersWithoutSub1: TeamCluster[] = [
      { ...clustersOnFloor1[0], agentIds: ['lead-1'] },
      clustersOnFloor1[1],
    ];
    const layoutHidden = computeOfficeLayout(clustersWithoutSub1, agentsWithoutSub1, floors);
    expect(controller.syncLayout(layoutHidden, agentsWithoutSub1)).toBe(true);
    expect(controller.getState('sub-1')).toBeUndefined();
    expect(controller.getRoamingAgentIds().has('sub-1')).toBe(false);
    expect(controller.getState('sub-2')).toMatchObject({
      mode: 'visiting',
      partnerId: null,
      bubble: null,
    });
  });
});
