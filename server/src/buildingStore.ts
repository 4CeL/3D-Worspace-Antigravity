import fs from 'node:fs';
import path from 'node:path';
import type { BuildingConfig, FloorConfig } from '@office/shared';

export const DEFAULT_FLOOR_ID = 'floor-1';
export const MAX_FLOORS = 8;

export function createDefaultBuildingConfig(): BuildingConfig {
  return {
    floors: [{ id: DEFAULT_FLOOR_ID, index: 1, name: 'Lantai 1' }],
    teamFloors: {},
  };
}

export function normalizeBuildingConfig(raw: unknown): BuildingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultBuildingConfig();
  }
  const obj = raw as { floors?: unknown; teamFloors?: unknown };
  const rawFloors = Array.isArray(obj.floors) ? obj.floors : [];

  const seenIds = new Set<string>();
  const floors: FloorConfig[] = [];
  for (const item of rawFloors) {
    if (!item || typeof item !== 'object') continue;
    const f = item as { id?: unknown; name?: unknown };
    const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : '';
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const index = floors.length + 1;
    const name =
      typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 40) : `Lantai ${index}`;
    floors.push({ id, index, name });
    if (floors.length >= MAX_FLOORS) break;
  }

  if (floors.length === 0) {
    floors.push({ id: DEFAULT_FLOOR_ID, index: 1, name: 'Lantai 1' });
  }

  const validFloorIds = new Set(floors.map((f) => f.id));
  const fallbackFloorId = floors[0].id;
  const teamFloors: Record<string, string> = {};

  if (obj.teamFloors && typeof obj.teamFloors === 'object' && !Array.isArray(obj.teamFloors)) {
    for (const [rootId, floorId] of Object.entries(obj.teamFloors as Record<string, unknown>)) {
      if (typeof rootId === 'string' && rootId.trim() && typeof floorId === 'string') {
        teamFloors[rootId.trim()] = validFloorIds.has(floorId) ? floorId : fallbackFloorId;
      }
    }
  }

  return { floors, teamFloors };
}

export function loadBuildingConfig(filePath: string): BuildingConfig {
  try {
    if (!fs.existsSync(filePath)) return createDefaultBuildingConfig();
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return createDefaultBuildingConfig();
    return normalizeBuildingConfig(JSON.parse(raw));
  } catch {
    return createDefaultBuildingConfig();
  }
}

export function saveBuildingConfig(filePath: string, config: BuildingConfig): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
