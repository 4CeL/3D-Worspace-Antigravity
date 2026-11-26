import type { AgentNode, FloorConfig, FloorTheme, TeamCluster } from '@office/shared';

export const FLOOR_HEIGHT = 5.4;
export const FIXED_FLOOR_WIDTH = 28;
export const FIXED_FLOOR_DEPTH = 24;

export const FLOOR_THEME_CYCLE: readonly FloorTheme[] = [
  'engineering',
  'lobby',
  'creative',
  'pantry',
];

export function resolveFloorTheme(floor: Pick<FloorConfig, 'index' | 'theme'>): FloorTheme {
  if (
    typeof floor.theme === 'string' &&
    (FLOOR_THEME_CYCLE as readonly string[]).includes(floor.theme)
  ) {
    return floor.theme;
  }
  const safeIndex = Number.isFinite(floor.index) ? Math.floor(floor.index) : 1;
  const idx =
    (((safeIndex - 1) % FLOOR_THEME_CYCLE.length) + FLOOR_THEME_CYCLE.length) %
    FLOOR_THEME_CYCLE.length;
  return FLOOR_THEME_CYCLE[idx];
}

export interface GlassSuiteSlot {
  id: string;
  label: string;
  center: [number, number, number];
  width: number;
  depth: number;
  doorPosition: [number, number];
  doorSide: 'south' | 'north';
}

export interface DeskPlacement {
  agentId: string;
  clusterId: string;
  floorId: string;
  suiteId?: string;
  doorPosition?: [number, number];
  isLead: boolean;
  position: [number, number, number];
  rotationY: number;
}

export interface ClusterPlacement {
  rootId: string;
  floorId: string;
  suiteId?: string;
  doorPosition?: [number, number];
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
  theme: FloorTheme;
  y: number;
  suites: GlassSuiteSlot[];
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

interface SuiteTemplate {
  id: string;
  label: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  doorPosition: [number, number];
  doorSide: 'south' | 'north';
}

/**
 * Fixed 4 Glass Team Suites on every 28 x 24 floorplate:
 * - North row (z in [-11.3, -2.8]): Suite 1 & Suite 2 opening South to central corridor
 * - South row (z in [2.8, 11.2]): Suite 3 & Suite 4 opening North to central corridor
 */
const SUITE_TEMPLATES: readonly SuiteTemplate[] = [
  {
    id: 'suite-1',
    label: 'Suite 1',
    centerX: -4.6,
    centerZ: -7.05,
    width: 8.4,
    depth: 8.5,
    doorPosition: [-4.6, -2.8],
    doorSide: 'south',
  },
  {
    id: 'suite-2',
    label: 'Suite 2',
    centerX: 4.4,
    centerZ: -7.05,
    width: 8.4,
    depth: 8.5,
    doorPosition: [4.4, -2.8],
    doorSide: 'south',
  },
  {
    id: 'suite-3',
    label: 'Suite 3',
    centerX: -4.3,
    centerZ: 7.0,
    width: 8.2,
    depth: 8.4,
    doorPosition: [-4.3, 2.8],
    doorSide: 'north',
  },
  {
    id: 'suite-4',
    label: 'Suite 4',
    centerX: 4.5,
    centerZ: 7.0,
    width: 8.2,
    depth: 8.4,
    doorPosition: [4.5, 2.8],
    doorSide: 'north',
  },
];

function createFloorSuites(y: number): GlassSuiteSlot[] {
  return SUITE_TEMPLATES.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    center: [tpl.centerX, y, tpl.centerZ],
    width: tpl.width,
    depth: tpl.depth,
    doorPosition: [tpl.doorPosition[0], tpl.doorPosition[1]],
    doorSide: tpl.doorSide,
  }));
}

/**
 * Computes neat, non-overlapping desk coordinates strictly inside a Glass Suite's
 * interior bounds (>= 2.2 spacing between desks, >= 0.9 physical clearance from all 4 glass walls).
 */
function placeDesksInSuite(
  suite: GlassSuiteSlot,
  cluster: TeamCluster,
  effectiveLeadId: string,
  agents: Record<string, AgentNode>,
  floorId: string,
  overflowPass: number,
): DeskPlacement[] {
  const [cx, y, cz] = suite.center;
  const subIds = cluster.agentIds.filter((id) => id !== effectiveLeadId);
  const subCount = subIds.length;
  const placed: DeskPlacement[] = [];

  // Subtle shift only if >4 clusters overflow onto an already-occupied suite
  const overflowOffsetX = overflowPass === 0 ? 0 : overflowPass % 2 === 1 ? 1.15 : -1.15;
  const overflowOffsetZ = overflowPass === 0 ? 0 : 1.15;

  const maxCenterOffsetX = suite.width / 2 - 1.65;
  const maxCenterOffsetZ = suite.depth / 2 - 1.7;

  const clampX = (x: number) =>
    Math.max(cx - maxCenterOffsetX, Math.min(cx + maxCenterOffsetX, x));
  const clampZ = (z: number) =>
    Math.max(cz - maxCenterOffsetZ, Math.min(cz + maxCenterOffsetZ, z));

  const leadAgent = agents[effectiveLeadId];

  if (subCount === 0) {
    placed.push({
      agentId: effectiveLeadId,
      clusterId: cluster.rootId,
      floorId,
      suiteId: suite.id,
      doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
      isLead: leadAgent ? !leadAgent.isSubagent : true,
      position: [clampX(cx + overflowOffsetX), y, clampZ(cz + overflowOffsetZ)],
      rotationY: 0,
    });
    return placed;
  }

  const subCols = subCount <= 3 ? subCount : 3;
  const subRows = Math.ceil(subCount / subCols);
  const spacingX = subCols <= 2 ? 2.6 : 2.35;
  const spacingZ = subRows === 1 ? 2.5 : 2.25;

  // Center the lead + subagent rows vertically inside the suite
  const totalDepthSpan = subRows * spacingZ;
  const leadZ = clampZ(cz - totalDepthSpan / 2 - (subRows > 1 ? 0.15 : 0.25) + overflowOffsetZ);

  placed.push({
    agentId: effectiveLeadId,
    clusterId: cluster.rootId,
    floorId,
    suiteId: suite.id,
    doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
    isLead: leadAgent ? !leadAgent.isSubagent : true,
    position: [clampX(cx + overflowOffsetX), y, leadZ],
    rotationY: 0,
  });

  subIds.forEach((subId, subIdx) => {
    const sCol = subIdx % subCols;
    const sRow = Math.floor(subIdx / subCols);
    const itemsInRow = Math.min(subCols, subCount - sRow * subCols);
    const rowWidth = (itemsInRow - 1) * spacingX;
    const x = clampX(cx - rowWidth / 2 + sCol * spacingX + overflowOffsetX);
    const z = clampZ(leadZ + (sRow + 1) * spacingZ);

    const agent = agents[subId];
    placed.push({
      agentId: subId,
      clusterId: cluster.rootId,
      floorId,
      suiteId: suite.id,
      doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
      isLead: agent ? !agent.isSubagent : false,
      position: [x, y, z],
      rotationY: Math.PI * 0.035 * (sCol % 2 === 0 ? 1 : -1),
    });
  });

  return placed;
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

  // Permanent, unchanging architectural floorplate dimensions
  const floorWidth = FIXED_FLOOR_WIDTH;
  const floorDepth = FIXED_FLOOR_DEPTH;

  const allClusterPlacements: ClusterPlacement[] = [];
  const floorLayouts: FloorLayout[] = [];
  const desks: Record<string, DeskPlacement> = {};
  let globalPaletteIdx = 0;

  for (const floor of floors) {
    const y = (floor.index - 1) * FLOOR_HEIGHT;
    const suites = createFloorSuites(y);
    const floorClusters = clustersByFloor.get(floor.id) ?? [];
    const floorClusterPlacements: ClusterPlacement[] = [];

    floorClusters.forEach((cluster, idx) => {
      const effectiveLeadId = cluster.agentIds.includes(cluster.leadAgentId)
        ? cluster.leadAgentId
        : cluster.agentIds[0];
      if (!effectiveLeadId) return;

      const suite = suites[idx % suites.length];
      const overflowPass = Math.floor(idx / suites.length);

      const placement: ClusterPlacement = {
        rootId: cluster.rootId,
        floorId: floor.id,
        suiteId: suite.id,
        doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
        projectName: cluster.projectName,
        title: cluster.title,
        center: [suite.center[0], y, suite.center[2]],
        rugWidth: suite.width - 0.85,
        rugDepth: suite.depth - 0.85,
        rugColor: RUG_PALETTE[globalPaletteIdx % RUG_PALETTE.length],
        leadAgentId: effectiveLeadId,
        agentIds: cluster.agentIds,
      };
      globalPaletteIdx += 1;
      floorClusterPlacements.push(placement);
      allClusterPlacements.push(placement);

      const suiteDesks = placeDesksInSuite(
        suite,
        cluster,
        effectiveLeadId,
        agents,
        floor.id,
        overflowPass,
      );
      for (const d of suiteDesks) {
        desks[d.agentId] = d;
      }
    });

    // Back-Right Glass Pantry/Coffee room focal point
    const coffeeCorner: [number, number, number] = [11.2, y, -9.8];

    floorLayouts.push({
      floorId: floor.id,
      index: floor.index,
      name: floor.name,
      theme: resolveFloorTheme(floor),
      y,
      suites,
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
    coffeeCorner: floorLayouts[0]?.coffeeCorner ?? [11.2, 0, -9.8],
  };
}
