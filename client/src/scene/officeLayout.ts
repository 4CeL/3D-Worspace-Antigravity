import type { AgentNode, TeamCluster } from '@office/shared';

export interface DeskPlacement {
  agentId: string;
  clusterId: string;
  isLead: boolean;
  position: [number, number, number];
  rotationY: number;
}

export interface ClusterPlacement {
  rootId: string;
  projectName: string;
  title: string;
  center: [number, number, number];
  rugWidth: number;
  rugDepth: number;
  rugColor: string;
  leadAgentId: string;
  agentIds: string[];
}

export interface OfficeLayout {
  floorWidth: number;
  floorDepth: number;
  clusters: ClusterPlacement[];
  desks: Record<string, DeskPlacement>;
  coffeeCorner: [number, number, number];
}

const RUG_PALETTE = ['#dce8df', '#e4e1f2', '#f3e5d2', '#dae9f5', '#f2e0e4'];
const DESK_SPACING_X = 3.0;
const DESK_SPACING_Z = 3.0;
const CLUSTER_GAP = 2.6;
const FLOOR_MARGIN = 5.5;
const MIN_FLOOR_SIZE = 16;

function measureCluster(memberCount: number): {
  rugWidth: number;
  rugDepth: number;
  subCols: number;
} {
  const subCount = Math.max(0, memberCount - 1);
  if (subCount === 0) {
    return { rugWidth: 4.6, rugDepth: 4.6, subCols: 1 };
  }
  const subCols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(subCount))));
  const subRows = Math.ceil(subCount / subCols);
  const rugWidth = Math.max(5.6, subCols * DESK_SPACING_X + 2.2);
  const rugDepth = Math.max(5.8, (subRows + 1) * DESK_SPACING_Z + 1.8);
  return { rugWidth, rugDepth, subCols };
}

export function computeOfficeLayout(
  clusters: TeamCluster[],
  agents: Record<string, AgentNode>,
): OfficeLayout {
  if (clusters.length === 0) {
    return {
      floorWidth: MIN_FLOOR_SIZE,
      floorDepth: MIN_FLOOR_SIZE,
      clusters: [],
      desks: {},
      coffeeCorner: [MIN_FLOOR_SIZE / 2 - 2.4, 0, -MIN_FLOOR_SIZE / 2 + 2.2],
    };
  }

  const measured = clusters.map((c) => ({
    cluster: c,
    ...measureCluster(c.agentIds.length),
  }));

  const gridCols = Math.ceil(Math.sqrt(clusters.length));
  const gridRows = Math.ceil(clusters.length / gridCols);

  const colWidths = new Array<number>(gridCols).fill(0);
  const rowDepths = new Array<number>(gridRows).fill(0);

  measured.forEach((m, idx) => {
    const col = idx % gridCols;
    const row = Math.floor(idx / gridCols);
    colWidths[col] = Math.max(colWidths[col], m.rugWidth);
    rowDepths[row] = Math.max(rowDepths[row], m.rugDepth);
  });

  const totalGridW =
    colWidths.reduce((a, b) => a + b, 0) + Math.max(0, gridCols - 1) * CLUSTER_GAP;
  const totalGridD =
    rowDepths.reduce((a, b) => a + b, 0) + Math.max(0, gridRows - 1) * CLUSTER_GAP;

  const floorWidth = Math.max(MIN_FLOOR_SIZE, totalGridW + FLOOR_MARGIN * 2);
  const floorDepth = Math.max(MIN_FLOOR_SIZE, totalGridD + FLOOR_MARGIN * 2);

  const colCenters: number[] = [];
  let cursorX = -totalGridW / 2;
  for (let c = 0; c < gridCols; c++) {
    colCenters.push(cursorX + colWidths[c] / 2);
    cursorX += colWidths[c] + CLUSTER_GAP;
  }

  const rowCenters: number[] = [];
  let cursorZ = -totalGridD / 2;
  for (let r = 0; r < gridRows; r++) {
    rowCenters.push(cursorZ + rowDepths[r] / 2);
    cursorZ += rowDepths[r] + CLUSTER_GAP;
  }

  const clusterPlacements: ClusterPlacement[] = [];
  const desks: Record<string, DeskPlacement> = {};

  measured.forEach((m, idx) => {
    const col = idx % gridCols;
    const row = Math.floor(idx / gridCols);
    const cx = colCenters[col];
    const cz = rowCenters[row];
    const { cluster, rugWidth, rugDepth, subCols } = m;

    clusterPlacements.push({
      rootId: cluster.rootId,
      projectName: cluster.projectName,
      title: cluster.title,
      center: [cx, 0, cz],
      rugWidth,
      rugDepth,
      rugColor: RUG_PALETTE[idx % RUG_PALETTE.length],
      leadAgentId: cluster.leadAgentId,
      agentIds: cluster.agentIds,
    });

    const subIds = cluster.agentIds.filter((id) => id !== cluster.leadAgentId);
    const hasSubs = subIds.length > 0;
    const leadZ = hasSubs ? cz - rugDepth / 2 + 1.85 : cz;

    desks[cluster.leadAgentId] = {
      agentId: cluster.leadAgentId,
      clusterId: cluster.rootId,
      isLead: true,
      position: [cx, 0, leadZ],
      rotationY: 0,
    };

    subIds.forEach((subId, subIdx) => {
      const sCol = subIdx % subCols;
      const sRow = Math.floor(subIdx / subCols);
      const itemsInRow = Math.min(subCols, subIds.length - sRow * subCols);
      const rowWidth = (itemsInRow - 1) * DESK_SPACING_X;
      const x = cx - rowWidth / 2 + sCol * DESK_SPACING_X;
      const z = leadZ + (sRow + 1) * DESK_SPACING_Z;

      const agent = agents[subId];
      desks[subId] = {
        agentId: subId,
        clusterId: cluster.rootId,
        isLead: agent ? !agent.isSubagent : false,
        position: [x, 0, z],
        rotationY: Math.PI * 0.04 * (sCol % 2 === 0 ? 1 : -1),
      };
    });
  });

  return {
    floorWidth,
    floorDepth,
    clusters: clusterPlacements,
    desks,
    coffeeCorner: [floorWidth / 2 - 2.4, 0, -floorDepth / 2 + 2.1],
  };
}
