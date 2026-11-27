import type { OfficeSnapshot } from '@office/shared';

export interface FilteredViewResult {
  projects: string[];
  effectiveProject: string;
  snapshot: OfficeSnapshot;
}

export function filterSnapshotForView(
  snapshot: OfficeSnapshot,
  selectedProject: string,
  hideFinished: boolean,
): FilteredViewResult {
  const projectSet = new Set<string>();
  for (const c of snapshot.clusters) {
    projectSet.add(c.projectName);
  }
  const projects = Array.from(projectSet).sort();

  const effectiveProject =
    selectedProject !== 'ALL' && projectSet.has(selectedProject) ? selectedProject : 'ALL';

  const clusters = snapshot.clusters
    .filter((c) => effectiveProject === 'ALL' || c.projectName === effectiveProject)
    .map((c) => {
      if (!hideFinished) return c;
      const activeIds = c.agentIds.filter((id) => {
        const agent = snapshot.agents[id];
        return Boolean(agent && (agent.status !== 'idle' || agent.pendingApproval));
      });
      if (activeIds.length === 0) return { ...c, agentIds: [] };
      const leadAgentId = activeIds.includes(c.leadAgentId) ? c.leadAgentId : activeIds[0];
      return { ...c, leadAgentId, agentIds: activeIds };
    })
    .filter((c) => c.agentIds.length > 0);

  const visibleIds = new Set(clusters.flatMap((c) => c.agentIds));
  const agents: OfficeSnapshot['agents'] = {};
  for (const id of visibleIds) {
    if (snapshot.agents[id]) {
      agents[id] = snapshot.agents[id];
    }
  }

  return {
    projects,
    effectiveProject,
    snapshot: {
      ...snapshot,
      clusters,
      agents,
      activePulses: snapshot.activePulses.filter(
        (p) => visibleIds.has(p.fromAgentId) && visibleIds.has(p.toAgentId),
      ),
    },
  };
}
