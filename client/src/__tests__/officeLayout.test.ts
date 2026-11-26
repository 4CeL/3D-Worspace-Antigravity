import { describe, expect, it } from 'vitest';
import type { AgentNode, FloorConfig, TeamCluster } from '@office/shared';
import {
  FIXED_FLOOR_DEPTH,
  FIXED_FLOOR_WIDTH,
  FLOOR_HEIGHT,
  computeOfficeLayout,
  resolveFloorTheme,
} from '../scene/officeLayout';

function makeAgent(id: string, parentId: string | null, rootId: string): AgentNode {
  return {
    id,
    parentId,
    rootId,
    isSubagent: parentId !== null,
    displayName: id,
    role: parentId ? 'Subagent' : 'Main Agent',
    projectName: 'Demo',
    status: 'editing',
    files: [],
    recentActivity: [],
    lastUpdatedAt: Date.now(),
    createdAt: Date.now(),
  };
}

describe('computeOfficeLayout', () => {
  it('locks floor dimensions to FIXED_FLOOR_WIDTH (28) x FIXED_FLOOR_DEPTH (24) for 0, 1, and 4 clusters', () => {
    // 0 clusters
    const emptyLayout = computeOfficeLayout([], {});
    expect(emptyLayout.floorWidth).toBe(FIXED_FLOOR_WIDTH);
    expect(emptyLayout.floorDepth).toBe(FIXED_FLOOR_DEPTH);
    expect(FIXED_FLOOR_WIDTH).toBe(28);
    expect(FIXED_FLOOR_DEPTH).toBe(24);
    expect(emptyLayout.clusters).toHaveLength(0);
    expect(emptyLayout.floors[0].suites).toHaveLength(4);

    // 1 cluster
    const soloAgents = { 'lead-solo': makeAgent('lead-solo', null, 'lead-solo') };
    const soloClusters: TeamCluster[] = [
      {
        rootId: 'lead-solo',
        projectName: 'Solo',
        title: 'Solo Task',
        leadAgentId: 'lead-solo',
        agentIds: ['lead-solo'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];
    const soloLayout = computeOfficeLayout(soloClusters, soloAgents);
    expect(soloLayout.floorWidth).toBe(FIXED_FLOOR_WIDTH);
    expect(soloLayout.floorDepth).toBe(FIXED_FLOOR_DEPTH);
    expect(soloLayout.floors[0].suites).toHaveLength(4);
  });

  it('assigns 4 multi-agent teams into 4 glass suites with one shared conference table and facing seats', () => {
    const clusters: TeamCluster[] = [];
    const agents: Record<string, AgentNode> = {};

    for (let c = 0; c < 4; c++) {
      const leadId = `lead-${c}`;
      const subIds = [`sub-${c}-1`, `sub-${c}-2`, `sub-${c}-3`];
      agents[leadId] = makeAgent(leadId, null, leadId);
      for (const s of subIds) {
        agents[s] = makeAgent(s, leadId, leadId);
      }
      clusters.push({
        rootId: leadId,
        projectName: `Project ${c}`,
        title: `Task ${c}`,
        leadAgentId: leadId,
        agentIds: [leadId, ...subIds],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      });
    }

    const layout = computeOfficeLayout(clusters, agents);
    expect(layout.floorWidth).toBe(FIXED_FLOOR_WIDTH);
    expect(layout.floorDepth).toBe(FIXED_FLOOR_DEPTH);
    expect(layout.floors[0].suites).toHaveLength(4);

    const suitesById = new Map(layout.floors[0].suites.map((s) => [s.id, s]));
    const clustersById = new Map(layout.clusters.map((c) => [c.rootId, c]));
    const allDesks = Object.values(layout.desks);
    expect(allDesks).toHaveLength(16);

    // Every cluster has ONE centered shared conference table well inside its Glass Suite
    for (const cluster of layout.clusters) {
      expect(cluster.table).toBeDefined();
      const table = cluster.table!;
      const suite = suitesById.get(cluster.suiteId!)!;
      expect(table.width).toBeCloseTo(2.2);
      expect(table.length).toBeGreaterThanOrEqual(3.4);
      expect(table.length).toBeLessThanOrEqual(5.2);
      expect(Math.abs(table.center[0] - suite.center[0]) + table.width / 2).toBeLessThanOrEqual(
        suite.width / 2 - 1.5,
      );
      expect(Math.abs(table.center[2] - suite.center[2]) + table.length / 2).toBeLessThanOrEqual(
        suite.depth / 2 - 1.5,
      );
    }

    // Every seat has its monitor ON the shared tabletop and its chair strictly inside the Glass Suite
    for (const desk of allDesks) {
      expect(desk.suiteId).toBeDefined();
      expect(desk.doorPosition).toBeDefined();
      const suite = suitesById.get(desk.suiteId!)!;
      const table = clustersById.get(desk.clusterId)!.table!;
      const [sx, , sz] = suite.center;
      const sinR = Math.sin(desk.rotationY);
      const cosR = Math.cos(desk.rotationY);

      if (desk.isLead) {
        expect(desk.rotationY).toBeCloseTo(suite.doorSide === 'south' ? Math.PI : 0);
      } else {
        expect(Math.abs(desk.rotationY)).toBeCloseTo(Math.PI / 2);
      }

      // Monitor center (local z = -0.34) rests strictly inside the shared tabletop
      const monX = desk.position[0] - 0.34 * sinR;
      const monZ = desk.position[2] - 0.34 * cosR;
      expect(Math.abs(monX - table.center[0])).toBeLessThanOrEqual(table.width / 2 - 0.15);
      expect(Math.abs(monZ - table.center[2])).toBeLessThanOrEqual(table.length / 2 - 0.15);

      // Chair back (local z = +0.90) stays well inside the Glass Suite walls
      const chairBackX = desk.position[0] + 0.9 * sinR;
      const chairBackZ = desk.position[2] + 0.9 * cosR;
      expect(Math.abs(chairBackX - sx)).toBeLessThanOrEqual(suite.width / 2 - 0.6);
      expect(Math.abs(chairBackZ - sz)).toBeLessThanOrEqual(suite.depth / 2 - 0.6);
    }

    // All 16 seats maintain clean non-overlapping spacing >= 1.45
    for (let i = 0; i < allDesks.length; i++) {
      for (let j = i + 1; j < allDesks.length; j++) {
        const dx = allDesks[i].position[0] - allDesks[j].position[0];
        const dz = allDesks[i].position[2] - allDesks[j].position[2];
        const dist = Math.hypot(dx, dz);
        expect(dist).toBeGreaterThanOrEqual(1.45);
      }
    }
  });

  it('places coordinator desk at cluster lead position and subagents inside suite & rug bounds', () => {
    const leadId = 'lead-1';
    const sub1 = 'sub-1';
    const sub2 = 'sub-2';
    const agents: Record<string, AgentNode> = {
      [leadId]: makeAgent(leadId, null, leadId),
      [sub1]: makeAgent(sub1, leadId, leadId),
      [sub2]: makeAgent(sub2, leadId, leadId),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: leadId,
        projectName: '3D Workspace',
        title: 'Main',
        leadAgentId: leadId,
        agentIds: [leadId, sub1, sub2],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents);
    const cluster = layout.clusters[0];
    const leadDesk = layout.desks[leadId];
    expect(leadDesk.isLead).toBe(true);
    expect(cluster.suiteId).toBe('suite-1');
    expect(cluster.doorPosition).toEqual([-4.6, -2.8]);

    for (const id of [leadId, sub1, sub2]) {
      const desk = layout.desks[id];
      const halfW = cluster.rugWidth / 2;
      const halfD = cluster.rugDepth / 2;
      expect(Math.abs(desk.position[0] - cluster.center[0])).toBeLessThanOrEqual(halfW);
      expect(Math.abs(desk.position[2] - cluster.center[2])).toBeLessThanOrEqual(halfD);
    }
  });

  it('does not place a phantom desk when cluster.leadAgentId is absent from cluster.agentIds', () => {
    const sub1 = 'sub-1';
    const agents: Record<string, AgentNode> = {
      [sub1]: makeAgent(sub1, 'missing-lead', 'missing-lead'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'missing-lead',
        projectName: '3D Workspace',
        title: 'Main',
        leadAgentId: 'missing-lead',
        agentIds: [sub1],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents);
    expect(layout.desks['missing-lead']).toBeUndefined();
    expect(layout.desks[sub1]).toBeDefined();
  });

  it('stacks teams vertically across multiple floors with unified fixed footprint and exact Y heights', () => {
    const floors: FloorConfig[] = [
      { id: 'floor-1', index: 1, name: 'Lantai 1' },
      { id: 'floor-2', index: 2, name: 'Lantai 2' },
    ];
    const agents: Record<string, AgentNode> = {
      'lead-a': makeAgent('lead-a', null, 'lead-a'),
      'lead-b': makeAgent('lead-b', null, 'lead-b'),
    };
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-a',
        projectName: 'Web',
        title: 'Web Team',
        leadAgentId: 'lead-a',
        agentIds: ['lead-a'],
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
      {
        rootId: 'lead-b',
        projectName: 'Mobile',
        title: 'Mobile Team',
        leadAgentId: 'lead-b',
        agentIds: ['lead-b'],
        floorId: 'floor-2',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents, floors);
    expect(layout.floorWidth).toBe(FIXED_FLOOR_WIDTH);
    expect(layout.floorDepth).toBe(FIXED_FLOOR_DEPTH);
    expect(layout.floors).toHaveLength(2);
    expect(layout.floors[0].suites).toHaveLength(4);
    expect(layout.floors[1].suites).toHaveLength(4);
    expect(layout.floors[0].y).toBe(0);
    expect(layout.floors[1].y).toBeCloseTo(FLOOR_HEIGHT);
    expect(layout.desks['lead-a'].position[1]).toBe(0);
    expect(layout.desks['lead-b'].position[1]).toBeCloseTo(FLOOR_HEIGHT);
    expect(layout.desks['lead-b'].floorId).toBe('floor-2');
  });

  it('resolves explicit, omitted, and invalid runtime floor themes deterministically', () => {
    expect(resolveFloorTheme({ index: 1 })).toBe('engineering');
    expect(resolveFloorTheme({ index: 2 })).toBe('lobby');
    expect(resolveFloorTheme({ index: 3 })).toBe('creative');
    expect(resolveFloorTheme({ index: 4 })).toBe('pantry');
    expect(resolveFloorTheme({ index: 5 })).toBe('engineering');
    expect(resolveFloorTheme({ index: 2, theme: 'pantry' })).toBe('pantry');
    expect(resolveFloorTheme({ index: 3, theme: 'invalid-runtime' as never })).toBe('creative');
    expect(resolveFloorTheme({ index: Number.NaN })).toBe('engineering');

    const floors: FloorConfig[] = [
      { id: 'f1', index: 1, name: 'L1', theme: 'pantry' },
      { id: 'f2', index: 2, name: 'L2' },
      { id: 'f3', index: 3, name: 'L3', theme: 'invalid-theme' as never },
    ];
    const layout = computeOfficeLayout([], {}, floors);
    expect(layout.floors.map((f) => f.theme)).toEqual(['pantry', 'lobby', 'creative']);
  });

  it('keeps shared tables, monitors, and rotated chairs strictly inside glass suite walls for 1, 3, 5, and 7 agents and >4 overflow teams', () => {
    const teamSizes = [1, 3, 5, 7, 2]; // 5th team overflows into Suite 1
    const clusters: TeamCluster[] = [];
    const agents: Record<string, AgentNode> = {};

    teamSizes.forEach((size, idx) => {
      const leadId = `lead-t${idx}`;
      const memberIds = [leadId];
      agents[leadId] = makeAgent(leadId, null, leadId);
      for (let s = 1; s < size; s++) {
        const subId = `sub-t${idx}-${s}`;
        agents[subId] = makeAgent(subId, leadId, leadId);
        memberIds.push(subId);
      }
      clusters.push({
        rootId: leadId,
        projectName: `Proj ${idx}`,
        title: `Team ${idx}`,
        leadAgentId: leadId,
        agentIds: memberIds,
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      });
    });

    const layout = computeOfficeLayout(clusters, agents);
    const suitesById = new Map(layout.floors[0].suites.map((s) => [s.id, s]));

    for (const cluster of layout.clusters) {
      const suite = suitesById.get(cluster.suiteId!)!;
      const table = cluster.table!;
      expect(table).toBeDefined();
      expect(Math.abs(table.center[0] - suite.center[0]) + table.width / 2).toBeLessThan(
        suite.width / 2 - 0.5,
      );
      expect(Math.abs(table.center[2] - suite.center[2]) + table.length / 2).toBeLessThan(
        suite.depth / 2 - 0.5,
      );
    }

    for (const desk of Object.values(layout.desks)) {
      const suite = suitesById.get(desk.suiteId!)!;
      const [sx, , sz] = suite.center;
      const halfW = suite.width / 2;
      const halfD = suite.depth / 2;
      const sinR = Math.sin(desk.rotationY);
      const cosR = Math.cos(desk.rotationY);

      // Rotated chair back (local [0, +0.92]) and monitor (local [0, -0.36]) stay strictly inside glass walls
      const chairX = desk.position[0] + 0.92 * sinR;
      const chairZ = desk.position[2] + 0.92 * cosR;
      const monX = desk.position[0] - 0.36 * sinR;
      const monZ = desk.position[2] - 0.36 * cosR;

      expect(Math.abs(chairX - sx)).toBeLessThan(halfW - 0.45);
      expect(Math.abs(chairZ - sz)).toBeLessThan(halfD - 0.45);
      expect(Math.abs(monX - sx)).toBeLessThan(halfW - 0.45);
      expect(Math.abs(monZ - sz)).toBeLessThan(halfD - 0.45);
    }

    // Within each single-team suite (teams 1..3 with 3, 5, 7 agents), seats keep >= 1.45 spacing
    for (let idx = 1; idx <= 3; idx++) {
      const ids = clusters[idx].agentIds;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = layout.desks[ids[i]];
          const b = layout.desks[ids[j]];
          expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThanOrEqual(
            1.45,
          );
        }
      }
    }
  });

  it('places 8th and 9th team members at the opposite foot end strictly inside suite walls and on the tabletop', () => {
    const agents: Record<string, AgentNode> = {
      'lead-big': makeAgent('lead-big', null, 'lead-big'),
    };
    const memberIds = ['lead-big'];
    for (let i = 1; i <= 8; i++) {
      const id = `sub-big-${i}`;
      agents[id] = makeAgent(id, 'lead-big', 'lead-big');
      memberIds.push(id);
    }
    const clusters: TeamCluster[] = [
      {
        rootId: 'lead-big',
        projectName: 'Big Team',
        title: 'Large Sprint',
        leadAgentId: 'lead-big',
        agentIds: memberIds,
        floorId: 'floor-1',
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents);
    const suite = layout.floors[0].suites[0];
    const table = layout.clusters[0].table!;
    const [sx, , sz] = suite.center;

    // 7th and 8th subagents sit at opposite foot end facing North (rotationY = 0 in North suite)
    for (const id of ['sub-big-7', 'sub-big-8']) {
      const desk = layout.desks[id];
      expect(desk.rotationY).toBeCloseTo(0);
      const monX = desk.position[0] - 0.34 * Math.sin(desk.rotationY);
      const monZ = desk.position[2] - 0.34 * Math.cos(desk.rotationY);
      expect(Math.abs(monX - table.center[0])).toBeLessThanOrEqual(table.width / 2 - 0.15);
      expect(Math.abs(monZ - table.center[2])).toBeLessThanOrEqual(table.length / 2 - 0.15);

      const chairBackZ = desk.position[2] + 0.9 * Math.cos(desk.rotationY);
      expect(Math.abs(chairBackZ - sz)).toBeLessThanOrEqual(suite.depth / 2 - 0.5);
      expect(Math.abs(desk.position[0] - sx)).toBeLessThanOrEqual(suite.width / 2 - 0.5);
    }
  });
});
