import type { AgentNode, FloorConfig, TeamCluster } from '@office/shared';

export const FLOOR_HEIGHT = 5.4;

export interface DeskPlacement {
  agentId: string;
  clusterId: string;
  floorId: string;
  isLead: boolean;
  position: [number, number, number];
  rotationY: number;
}

export interface ClusterPlacement {
  rootId: string;
  floorId: string;
  projectName: string;
  title: string;
  center: [number, number, number];
  rugWidth: number;
  rugDepth: number;
  rugColor: string;
  leadAgentId: string;
  agentIds: string[];
}

export interface FloorLayout {
  floorId: string;
  index: number;
  name: string;
  y: number;
  clusters: ClusterPlacement[];
  coffeeCorner: [number, number, number];
}

export interface OfficeLayout {
  floorWidth: number;
  floorDepth: number;
  floors: FloorLayout[];
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

function measureFloorClusters(floorClusters: TeamCluster[]) {
  if (floorClusters.length === 0) {
    return {
      measured: [] as Array<{
        cluster: TeamCluster;
        rugWidth: number;
        rugDepth: number;
        subCols: number;
      }>,
      gridCols: 0,
      colWidths: [] as number[],
      rowDepths: [] as number[],
      totalGridW: 0,
      totalGridD: 0,
      neededWidth: MIN_FLOOR_SIZE,
      neededDepth: MIN_FLOOR_SIZE,
    };
  }

  const measured = floorClusters.map((c) => ({
    cluster: c,
    ...measureCluster(c.agentIds.length),
  }));

  const gridCols = Math.ceil(Math.sqrt(floorClusters.length));
  const gridRows = Math.ceil(floorClusters.length / gridCols);
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

  return {
    measured,
    gridCols,
    colWidths,
    rowDepths,
    totalGridW,
    totalGridD,
    neededWidth: Math.max(MIN_FLOOR_SIZE, totalGridW + FLOOR_MARGIN * 2),
    neededDepth: Math.max(MIN_FLOOR_SIZE, totalGridD + FLOOR_MARGIN * 2),
  };
}

export function computeOfficeLayout(
  clusters: TeamCluster[],
  agents: Record<string, AgentNode>,
  floorsInput?: FloorConfig[],
): OfficeLayout {
  const floors: FloorConfig[] =
    floorsInput && floorsInput.length > 0
      ? [...floorsInput].sort((a, b) => a.index - b.index)
      : [{ id: 'floor-1', index: 1, name: 'Lantai 1' }];

  const validFloorIds = new Set(floors.map((f) => f.id));
  const defaultFloorId = floors[0].id;

  const clustersByFloor = new Map<string, TeamCluster[]>();
  for (const f of floors) {
    clustersByFloor.set(f.id, []);
  }
  for (const c of clusters) {
    const targetFloorId = c.floorId && validFloorIds.has(c.floorId) ? c.floorId : defaultFloorId;
    clustersByFloor.get(targetFloorId)!.push(c);
  }

  // Measure every floor so the entire stacked building shares one cohesive footprint
  let floorWidth = MIN_FLOOR_SIZE;
  let floorDepth = MIN_FLOOR_SIZE;
  const floorMetrics = floors.map((floor) => {
    const list = clustersByFloor.get(floor.id) ?? [];
    const metrics = measureFloorClusters(list);
    floorWidth = Math.max(floorWidth, metrics.neededWidth);
    floorDepth = Math.max(floorDepth, metrics.neededDepth);
    return { floor, metrics };
  });

  const allClusterPlacements: ClusterPlacement[] = [];
  const floorLayouts: FloorLayout[] = [];
  const desks: Record<string, DeskPlacement> = {};
  let globalPaletteIdx = 0;

  for (const { floor, metrics } of floorMetrics) {
    const y = (floor.index - 1) * FLOOR_HEIGHT;
    const floorClusterPlacements: ClusterPlacement[] = [];

    if (metrics.measured.length > 0) {
      const colCenters: number[] = [];
      let cursorX = -metrics.totalGridW / 2;
      for (let c = 0; c < metrics.gridCols; c++) {
        colCenters.push(cursorX + metrics.colWidths[c] / 2);
        cursorX += metrics.colWidths[c] + CLUSTER_GAP;
      }

      const rowCenters: number[] = [];
      let cursorZ = -metrics.totalGridD / 2;
      for (let r = 0; r < metrics.rowDepths.length; r++) {
        rowCenters.push(cursorZ + metrics.rowDepths[r] / 2);
        cursorZ += metrics.rowDepths[r] + CLUSTER_GAP;
      }

      metrics.measured.forEach((m, idx) => {
        const col = idx % metrics.gridCols;
        const row = Math.floor(idx / metrics.gridCols);
        const cx = colCenters[col];
        const cz = rowCenters[row];
        const { cluster, rugWidth, rugDepth, subCols } = m;

        const effectiveLeadId = cluster.agentIds.includes(cluster.leadAgentId)
          ? cluster.leadAgentId
          : cluster.agentIds[0];
        if (!effectiveLeadId) return;

        const placement: ClusterPlacement = {
          rootId: cluster.rootId,
          floorId: floor.id,
          projectName: cluster.projectName,
          title: cluster.title,
          center: [cx, y, cz],
          rugWidth,
          rugDepth,
          rugColor: RUG_PALETTE[globalPaletteIdx % RUG_PALETTE.length],
          leadAgentId: effectiveLeadId,
          agentIds: cluster.agentIds,
        };
        globalPaletteIdx += 1;
        floorClusterPlacements.push(placement);
        allClusterPlacements.push(placement);

        const subIds = cluster.agentIds.filter((id) => id !== effectiveLeadId);
        const hasSubs = subIds.length > 0;
        const leadZ = hasSubs ? cz - rugDepth / 2 + 1.85 : cz;
        const leadAgent = agents[effectiveLeadId];

        desks[effectiveLeadId] = {
          agentId: effectiveLeadId,
          clusterId: cluster.rootId,
          floorId: floor.id,
          isLead: leadAgent ? !leadAgent.isSubagent : true,
          position: [cx, y, leadZ],
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
            floorId: floor.id,
            isLead: agent ? !agent.isSubagent : false,
            position: [x, y, z],
            rotationY: Math.PI * 0.04 * (sCol % 2 === 0 ? 1 : -1),
          };
        });
      });
    }

    const coffeeCorner: [number, number, number] = [
      floorWidth / 2 - 2.4,
      y,
      -floorDepth / 2 + 2.1,
    ];

    floorLayouts.push({
      floorId: floor.id,
      index: floor.index,
      name: floor.name,
      y,
      clusters: floorClusterPlacements,
      coffeeCorner,
    });
  }

  return {
    floorWidth,
    floorDepth,
    floors: floorLayouts,
    clusters: allClusterPlacements,
    desks,
    coffeeCorner: floorLayouts[0]?.coffeeCorner ?? [
      floorWidth / 2 - 2.4,
      0,
      -floorDepth / 2 + 2.1,
    ],
  };
}
