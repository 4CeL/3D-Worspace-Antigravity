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

export interface SharedTableSpec {
  center: [number, number, number];
  width: number;
  length: number;
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
  table?: SharedTableSpec;
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
const SHARED_TABLE_WIDTH = 2.2;

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
 * Arranges ONE continuous shared conference/meeting worktable centered inside
 * the Glass Suite with:
 * - Main Agent at the head (away from the doorway, facing down the table)
 * - Subagents seated along both West & East long sides facing each other inward
 *   (with clean >= 1.55 along-side spacing and >= 1.80 across-table spacing).
 */
function placeSharedTableInSuite(
  suite: GlassSuiteSlot,
  cluster: TeamCluster,
  effectiveLeadId: string,
  agents: Record<string, AgentNode>,
  floorId: string,
  overflowPass: number,
): { table: SharedTableSpec; desks: DeskPlacement[] } {
  const [cx, y, cz] = suite.center;
  const subIds = cluster.agentIds.filter((id) => id !== effectiveLeadId);

  // Keep primary teams centered; shift slightly only for >4-team overflow on one floor
  const overflowOffsetX = overflowPass === 0 ? 0 : overflowPass % 2 === 1 ? 1.5 : -1.5;
  const tableCenterX = cx + overflowOffsetX;
  const tableWidth = SHARED_TABLE_WIDTH;

  const sideSeatIds = subIds.slice(0, 6);
  const extraFootIds = subIds.slice(6);
  const sideRows = Math.max(1, Math.ceil(sideSeatIds.length / 2));
  const maxTableLen = Math.min(5.2, suite.depth - 3.2);
  const tableLength = Math.min(maxTableLen, Math.max(3.4, sideRows * 1.65 + 1.45));

  const table: SharedTableSpec = {
    center: [tableCenterX, y, cz],
    width: tableWidth,
    length: tableLength,
  };

  const placed: DeskPlacement[] = [];
  const leadAgent = agents[effectiveLeadId];
  const isNorthSuite = suite.doorSide === 'south';
  const halfLen = tableLength / 2;
  const halfW = tableWidth / 2;

  // Main Agent sits at the head of the table, away from the doorway, facing down the table
  const leadZ = isNorthSuite ? cz - halfLen + 0.18 : cz + halfLen - 0.18;
  const leadRotY = isNorthSuite ? Math.PI : 0;

  placed.push({
    agentId: effectiveLeadId,
    clusterId: cluster.rootId,
    floorId,
    suiteId: suite.id,
    doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
    isLead: leadAgent ? !leadAgent.isSubagent : true,
    position: [tableCenterX, y, leadZ],
    rotationY: leadRotY,
  });

  // Compute evenly distributed Z coordinates along the West & East long sides
  // Leave >= 1.40 clearance from the Lead's head end so monitors & elbows never crowd
  const footMargin = extraFootIds.length > 0 ? 1.35 : 0.55;
  const zNearHead = isNorthSuite ? cz - halfLen + 1.4 : cz + halfLen - 1.4;
  const zNearFoot = isNorthSuite ? cz + halfLen - footMargin : cz - halfLen + footMargin;

  sideSeatIds.forEach((subId, idx) => {
    const isWest = idx % 2 === 0;
    const rowIdx = Math.floor(idx / 2);
    const z =
      sideRows === 1
        ? (zNearHead + zNearFoot) / 2
        : zNearHead + (rowIdx / (sideRows - 1)) * (zNearFoot - zNearHead);

    const x = isWest ? tableCenterX - halfW + 0.18 : tableCenterX + halfW - 0.18;
    const rotationY = isWest ? -Math.PI / 2 : Math.PI / 2;
    const agent = agents[subId];

    placed.push({
      agentId: subId,
      clusterId: cluster.rootId,
      floorId,
      suiteId: suite.id,
      doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
      isLead: agent ? !agent.isSubagent : false,
      position: [x, y, z],
      rotationY,
    });
  });

  // Clean opposite-head seating for any extra subagents beyond 6
  extraFootIds.forEach((subId, idx) => {
    const footZ = isNorthSuite ? cz + halfLen - 0.18 : cz - halfLen + 0.18;
    const footRotY = isNorthSuite ? 0 : Math.PI;
    const spreadX =
      extraFootIds.length === 1 ? 0 : (idx - (extraFootIds.length - 1) / 2) * 1.1;
    const agent = agents[subId];
    placed.push({
      agentId: subId,
      clusterId: cluster.rootId,
      floorId,
      suiteId: suite.id,
      doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
      isLead: agent ? !agent.isSubagent : false,
      position: [tableCenterX + spreadX, y, footZ],
      rotationY: footRotY,
    });
  });

  return { table, desks: placed };
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

      const { table, desks: suiteDesks } = placeSharedTableInSuite(
        suite,
        cluster,
        effectiveLeadId,
        agents,
        floor.id,
        overflowPass,
      );

      const placement: ClusterPlacement = {
        rootId: cluster.rootId,
        floorId: floor.id,
        suiteId: suite.id,
        doorPosition: [suite.doorPosition[0], suite.doorPosition[1]],
        table,
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
