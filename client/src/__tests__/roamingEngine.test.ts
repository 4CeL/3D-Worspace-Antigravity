import { describe, expect, it } from 'vitest';
import type { AgentNode, AgentStatus, FloorConfig, FloorTheme, TeamCluster } from '@office/shared';
import {
  FIXED_FLOOR_DEPTH,
  FIXED_FLOOR_WIDTH,
  computeOfficeLayout,
} from '../scene/officeLayout';
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

  it('places safe waypoints across the fixed 28x24 floorplan with wall and ElevatorCore clearance for every theme', () => {
    const halfW = FIXED_FLOOR_WIDTH / 2;
    const halfD = FIXED_FLOOR_DEPTH / 2;
    // ElevatorCore sits at [-halfW + 1.05, -halfD + 0.95]
    const elevX = -halfW + 1.05;
    const elevZ = -halfD + 0.95;

    for (const theme of themes) {
      const waypoints = computeFloorWaypoints(FIXED_FLOOR_WIDTH, FIXED_FLOOR_DEPTH, theme);
      expect(waypoints.length).toBeGreaterThanOrEqual(5);

      // Includes central corridor waypoint (z = 0)
      expect(waypoints.some((w) => Math.abs(w.z) < 0.01)).toBe(true);

      for (const wp of waypoints) {
        expect(wp.x).toBeGreaterThanOrEqual(-halfW + 1.5);
        expect(wp.x).toBeLessThanOrEqual(halfW - 1.5);
        expect(wp.z).toBeGreaterThanOrEqual(-halfD + 1.5);
        expect(wp.z).toBeLessThanOrEqual(halfD - 1.5);

        const distToElevator = Math.hypot(wp.x - elevX, wp.z - elevZ);
        expect(distToElevator).toBeGreaterThanOrEqual(2.2);
      }
    }
  });
});

describe('RoamingController', () => {
  it('routes idle subagents through their suite doorway into the central corridor while keeping Main Agents seated', () => {
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
    const suiteDoor = layout.desks['sub-alpha'].doorPosition!;
    expect(suiteDoor).toBeDefined();

    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    // After 2.5s (< 3.0s minimum staggered delay), subagent should still be seated
    advance(controller, 2.5);
    expect(controller.getState('lead-1')?.mode).toBe('seated');
    expect(controller.getState('sub-alpha')?.mode).toBe('seated');
    expect(controller.getRoamingAgentIds().size).toBe(0);

    // Step forward and record whether subagent passes cleanly through suite doorway & central corridor
    let passedThroughDoorway = false;
    let enteredCentralCorridor = false;
    let sawVisiting = false;

    for (let i = 0; i < 240; i++) {
      controller.step(0.1);
      const st = controller.getState('sub-alpha')!;
      if (Math.hypot(st.x - suiteDoor[0], st.z - suiteDoor[1]) < 0.45) {
        passedThroughDoorway = true;
      }
      if (Math.abs(st.z) < 0.45 && st.mode !== 'seated') {
        enteredCentralCorridor = true;
      }
      if (st.mode === 'visiting') {
        sawVisiting = true;
        break;
      }
    }

    expect(controller.getState('lead-1')?.mode).toBe('seated');
    expect(passedThroughDoorway).toBe(true);
    expect(enteredCentralCorridor).toBe(true);
    expect(sawVisiting).toBe(true);
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
    for (let i = 0; i < 400; i++) {
      controller.step(0.1);
      const s1 = controller.getState('sub-1');
      const s2 = controller.getState('sub-2');
      if (s1?.mode === 'chatting' && s2?.mode === 'chatting') {
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

    const spacing = Math.hypot(s2.x - s1.x, s2.z - s1.z);
    expect(spacing).toBeGreaterThanOrEqual(0.75);

    const dx12 = (s2.x - s1.x) / spacing;
    const dz12 = (s2.z - s1.z) / spacing;
    const face1Dot = Math.sin(s1.rotationY) * dx12 + Math.cos(s1.rotationY) * dz12;
    const face2Dot = Math.sin(s2.rotationY) * -dx12 + Math.cos(s2.rotationY) * -dz12;
    expect(face1Dot).toBeGreaterThan(0.9);
    expect(face2Dot).toBeGreaterThan(0.9);

    expect(['💬', '☕', '💡', '👋']).toContain(s1.bubble);
    expect(['💬', '☕', '💡', '👋']).toContain(s2.bubble);
  });

  it('immediately unpairs partner, returns via suite doorway to desk, and snaps back to seated when work resumes', () => {
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
    const suiteDoor = layout.desks['sub-1'].doorPosition!;
    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    for (let i = 0; i < 400; i++) {
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

    expect(controller.getState('sub-1')?.mode).toBe('returning');
    expect(controller.getState('sub-1')?.partnerId).toBeNull();
    expect(controller.getState('sub-1')?.bubble).toBeNull();
    expect(controller.getState('sub-2')?.partnerId).toBeNull();
    expect(controller.getState('sub-2')?.mode).toBe('visiting');

    // Track return through suite doorway back to desk
    let returnedViaDoorway = false;
    for (let i = 0; i < 160; i++) {
      controller.step(0.1);
      const st = controller.getState('sub-1')!;
      if (Math.hypot(st.x - suiteDoor[0], st.z - suiteDoor[1]) < 0.6) {
        returnedViaDoorway = true;
      }
      if (st.mode === 'seated') break;
    }

    expect(returnedViaDoorway).toBe(true);
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

  it('unpairs chat partner cleanly on floor change or agent removal, ignores NaN dt, and keeps glass-room chatters clear of doorways', () => {
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

    // Wait until sub-1 and sub-2 pair up to chat across the 28x24 floor
    for (let i = 0; i < 450; i++) {
      controller.step(0.1);
      if (
        controller.getState('sub-1')?.mode === 'chatting' &&
        controller.getState('sub-2')?.mode === 'chatting'
      ) {
        advance(controller, 0.8);
        break;
      }
    }
    const s1 = controller.getState('sub-1')!;
    const s2 = controller.getState('sub-2')!;
    expect(s1.partnerId).toBe('sub-2');
    expect(s2.partnerId).toBe('sub-1');
    // Neither chatter straddles a glass doorway wall (|z| in [2.35, 3.25])
    expect(Math.abs(s1.z) < 2.35 || Math.abs(s1.z) > 3.25).toBe(true);
    expect(Math.abs(s2.z) < 2.35 || Math.abs(s2.z) > 3.25).toBe(true);

    // NaN / negative dt must not corrupt positions
    expect(controller.step(Number.NaN)).toBe(false);
    expect(controller.step(-0.5)).toBe(false);
    expect(Number.isFinite(controller.getState('sub-1')!.x)).toBe(true);

    // Move Team B (sub-2) to floor-2 -> sub-2 resets seated on floor-2, sub-1 unpairs cleanly
    const clustersMoved: TeamCluster[] = [
      clustersOnFloor1[0],
      { ...clustersOnFloor1[1], floorId: 'floor-2' },
    ];
    const layoutMoved = computeOfficeLayout(clustersMoved, agents, floors);
    expect(controller.syncLayout(layoutMoved, agents)).toBe(true);
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
    for (let i = 0; i < 450; i++) {
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

  it('routes side-seated subagents around the shared conference table without intersecting the tabletop and restores inward facing on return', () => {
    const floors: FloorConfig[] = [{ id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'engineering' }];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'editing'),
      'sub-west': makeAgent('sub-west', 'lead-1', 'lead-1', 'idle'),
      'sub-east': makeAgent('sub-east', 'lead-1', 'lead-1', 'idle'),
      'sub-west-2': makeAgent('sub-west-2', 'lead-1', 'lead-1', 'idle'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: 'Shared Table Team',
        title: 'Sprint',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1', 'sub-west', 'sub-east', 'sub-west-2'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    const table = layout.clusters[0].table!;
    const subDesk = layout.desks['sub-west'];
    expect(Math.abs(subDesk.rotationY)).toBeCloseTo(Math.PI / 2);

    const tableMinX = table.center[0] - table.width / 2;
    const tableMaxX = table.center[0] + table.width / 2;
    const tableMinZ = table.center[2] - table.length / 2;
    const tableMaxZ = table.center[2] + table.length / 2;

    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    // Initial seated facing points inward toward the shared table (desk.rotationY + Math.PI)
    const initial = controller.getState('sub-west')!;
    expect(initial.rotationY).toBeCloseTo(subDesk.rotationY + Math.PI);

    // Walk out from side seat to a waypoint outside the suite, checking every frame never enters tabletop AABB
    let reachedOutsideSuite = false;
    for (let i = 0; i < 240; i++) {
      controller.step(0.05);
      const st = controller.getState('sub-west')!;
      const insideTable =
        st.x > tableMinX && st.x < tableMaxX && st.z > tableMinZ && st.z < tableMaxZ;
      expect(insideTable).toBe(false);
      if (Math.abs(st.z) < 0.4) {
        reachedOutsideSuite = true;
        break;
      }
    }
    expect(reachedOutsideSuite).toBe(true);

    // Assign work so sub-west returns through doorway and around the table to its side chair
    const workingAgents: Record<string, AgentNode> = {
      ...agents,
      'sub-west': makeAgent('sub-west', 'lead-1', 'lead-1', 'editing'),
    };
    controller.syncLayout(layout, workingAgents);

    let returnedSeated = false;
    for (let i = 0; i < 240; i++) {
      controller.step(0.05);
      const st = controller.getState('sub-west')!;
      const insideTable =
        st.x > tableMinX && st.x < tableMaxX && st.z > tableMinZ && st.z < tableMaxZ;
      expect(insideTable).toBe(false);
      if (st.mode === 'seated') {
        returnedSeated = true;
        break;
      }
    }
    expect(returnedSeated).toBe(true);

    const finalState = controller.getState('sub-west')!;
    const expectedSeatX = subDesk.position[0] + 0.56 * Math.sin(subDesk.rotationY);
    const expectedSeatZ = subDesk.position[2] + 0.56 * Math.cos(subDesk.rotationY);
    expect(Math.hypot(finalState.x - expectedSeatX, finalState.z - expectedSeatZ)).toBeLessThan(0.05);
    expect(finalState.rotationY).toBeCloseTo(subDesk.rotationY + Math.PI);
  });

  it('routes South-suite side-seated subagents around the table on exit, mid-suite interrupt, and opposite-foot exit/return', () => {
    const floors: FloorConfig[] = [{ id: 'floor-1', index: 1, name: 'Lantai 1', theme: 'lobby' }];
    const agents: Record<string, AgentNode> = {
      'lead-1': makeAgent('lead-1', null, 'lead-1', 'editing'),
      'lead-2': makeAgent('lead-2', null, 'lead-2', 'editing'),
      'lead-3': makeAgent('lead-3', null, 'lead-3', 'editing'),
    };
    const team3Ids = ['lead-3'];
    for (let i = 1; i <= 7; i++) {
      const id = `south-sub-${i}`;
      agents[id] = makeAgent(id, 'lead-3', 'lead-3', 'idle');
      team3Ids.push(id);
    }

    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-1',
        projectName: 'P1',
        title: 'T1',
        leadAgentId: 'lead-1',
        agentIds: ['lead-1'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
      {
        rootId: 'lead-2',
        projectName: 'P2',
        title: 'T2',
        leadAgentId: 'lead-2',
        agentIds: ['lead-2'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
      {
        rootId: 'lead-3',
        projectName: 'South Team',
        title: 'T3',
        leadAgentId: 'lead-3',
        agentIds: team3Ids,
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    const southCluster = layout.clusters[2];
    expect(southCluster.suiteId).toBe('suite-3');
    const table = southCluster.table!;
    const tableMinX = table.center[0] - table.width / 2;
    const tableMaxX = table.center[0] + table.width / 2;
    const tableMinZ = table.center[2] - table.length / 2;
    const tableMaxZ = table.center[2] + table.length / 2;

    const sideSubId = 'south-sub-1'; // West side in South suite
    const footSubId = 'south-sub-7'; // Opposite-foot end in South suite (doorSide === 'north')
    expect(layout.desks[sideSubId].rotationY).toBeCloseTo(-Math.PI / 2);
    expect(layout.desks[footSubId].rotationY).toBeCloseTo(Math.PI);

    const controller = new RoamingController();
    controller.syncLayout(layout, agents);

    // Step until sideSubId has rounded the north end of the South-suite table near doorway (still inside suite)
    let interruptedMidSuite = false;
    for (let i = 0; i < 200; i++) {
      controller.step(0.05);
      for (const id of [sideSubId, footSubId]) {
        const st = controller.getState(id)!;
        const insideTable =
          st.x > tableMinX && st.x < tableMaxX && st.z > tableMinZ && st.z < tableMaxZ;
        expect(insideTable).toBe(false);
      }
      const sideSt = controller.getState(sideSubId)!;
      if (
        !interruptedMidSuite &&
        sideSt.mode === 'walking_out' &&
        sideSt.z > 2.95 &&
        sideSt.z < 3.65 &&
        Math.abs(sideSt.x - southCluster.doorPosition![0]) < 1.2
      ) {
        // Mid-suite work interrupt near doorway
        controller.syncLayout(layout, {
          ...agents,
          [sideSubId]: makeAgent(sideSubId, 'lead-3', 'lead-3', 'editing'),
        });
        interruptedMidSuite = true;
        break;
      }
    }
    expect(interruptedMidSuite).toBe(true);

    // Continue until sideSubId returns cleanly around table to seated and footSubId exits to corridor
    let sideReturned = false;
    let footExited = false;
    for (let i = 0; i < 240; i++) {
      controller.step(0.05);
      for (const id of [sideSubId, footSubId]) {
        const st = controller.getState(id)!;
        const insideTable =
          st.x > tableMinX && st.x < tableMaxX && st.z > tableMinZ && st.z < tableMaxZ;
        expect(insideTable).toBe(false);
      }
      if (controller.getState(sideSubId)?.mode === 'seated') sideReturned = true;
      if (Math.abs(controller.getState(footSubId)!.z) < 0.4) footExited = true;
      if (sideReturned && footExited) break;
    }

    expect(sideReturned).toBe(true);
    expect(footExited).toBe(true);
    expect(controller.getState(sideSubId)!.rotationY).toBeCloseTo(
      layout.desks[sideSubId].rotationY + Math.PI,
    );
  });
});
