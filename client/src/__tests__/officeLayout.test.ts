import { describe, expect, it } from 'vitest';
import type { AgentNode, TeamCluster } from '@office/shared';
import { computeOfficeLayout } from '../scene/officeLayout';

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
  it('returns cozy minimum room dimensions when office has 0 clusters', () => {
    const layout = computeOfficeLayout([], {});
    expect(layout.floorWidth).toBeGreaterThanOrEqual(14);
    expect(layout.floorDepth).toBeGreaterThanOrEqual(14);
    expect(layout.clusters).toHaveLength(0);
  });

  it('expands floor and produces non-overlapping desks for multiple multi-agent clusters', () => {
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
        lastUpdatedAt: Date.now(),
      });
    }

    const layout = computeOfficeLayout(clusters, agents);
    expect(layout.floorWidth).toBeGreaterThan(16);
    expect(layout.floorDepth).toBeGreaterThan(16);

    const allDesks = Object.values(layout.desks);
    expect(allDesks).toHaveLength(16);

    for (let i = 0; i < allDesks.length; i++) {
      for (let j = i + 1; j < allDesks.length; j++) {
        const dx = allDesks[i].position[0] - allDesks[j].position[0];
        const dz = allDesks[i].position[2] - allDesks[j].position[2];
        const dist = Math.hypot(dx, dz);
        expect(dist).toBeGreaterThanOrEqual(2.1);
      }
    }
  });

  it('places coordinator desk at cluster lead position and subagents inside rug bounds', () => {
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
        lastUpdatedAt: Date.now(),
      },
    ];

    const layout = computeOfficeLayout(clusters, agents);
    const cluster = layout.clusters[0];
    const leadDesk = layout.desks[leadId];
    expect(leadDesk.isLead).toBe(true);

    for (const id of [leadId, sub1, sub2]) {
      const desk = layout.desks[id];
      const halfW = cluster.rugWidth / 2;
      const halfD = cluster.rugDepth / 2;
      expect(Math.abs(desk.position[0] - cluster.center[0])).toBeLessThanOrEqual(halfW);
      expect(Math.abs(desk.position[2] - cluster.center[2])).toBeLessThanOrEqual(halfD);
    }
  });
});
