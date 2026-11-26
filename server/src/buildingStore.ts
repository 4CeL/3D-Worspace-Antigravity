import fs from 'node:fs';
import path from 'node:path';
import type { BuildingConfig, FloorConfig, FloorTheme } from '@office/shared';

export const DEFAULT_FLOOR_ID = 'floor-1';
export const MAX_FLOORS = 8;
export const MAX_ROOT_ID_LEN = 128;
export const MAX_TEAM_FLOORS = 500;
export const FLOOR_THEMES: readonly FloorTheme[] = ['engineering', 'lobby', 'creative', 'pantry'];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_FLOOR_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function isSafeObjectKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_ROOT_ID_LEN && !FORBIDDEN_KEYS.has(key);
}

export function isValidFloorId(val: unknown): val is string {
  return typeof val === 'string' && SAFE_FLOOR_ID_RE.test(val) && !FORBIDDEN_KEYS.has(val);
}

export function isValidFloorTheme(val: unknown): val is FloorTheme {
  return typeof val === 'string' && (FLOOR_THEMES as readonly string[]).includes(val);
}

export function defaultThemeForFloorIndex(index: number): FloorTheme {
  const safeIndex = Number.isFinite(index) ? Math.floor(index) : 1;
  return FLOOR_THEMES[(Math.max(1, safeIndex) - 1) % FLOOR_THEMES.length];
}

export function createDefaultBuildingConfig(): BuildingConfig {
  return {
    floors: [{ id: DEFAULT_FLOOR_ID, index: 1, name: 'Lantai 1', theme: 'engineering' }],
    teamFloors: {},
    hiddenAgents: [],
  };
}

export function normalizeBuildingConfig(raw: unknown): BuildingConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultBuildingConfig();
  }
  const obj = raw as { floors?: unknown; teamFloors?: unknown; hiddenAgents?: unknown };
  const rawFloors = Array.isArray(obj.floors) ? obj.floors : [];

  const seenIds = new Set<string>();
  const floors: FloorConfig[] = [];
  for (const item of rawFloors) {
    if (!item || typeof item !== 'object') continue;
    const f = item as { id?: unknown; name?: unknown; theme?: unknown };
    const id = typeof f.id === 'string' ? f.id.trim() : '';
    if (!isValidFloorId(id) || seenIds.has(id)) continue;
    seenIds.add(id);
    const index = floors.length + 1;
    const name =
      typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 40) : `Lantai ${index}`;
    const theme = isValidFloorTheme(f.theme) ? f.theme : defaultThemeForFloorIndex(index);
    floors.push({ id, index, name, theme });
    if (floors.length >= MAX_FLOORS) break;
  }

  if (floors.length === 0) {
    floors.push({ id: DEFAULT_FLOOR_ID, index: 1, name: 'Lantai 1', theme: 'engineering' });
  }

  const validFloorIds = new Set(floors.map((f) => f.id));
  const fallbackFloorId = floors[0].id;
  const teamFloors: Record<string, string> = Object.create(null);

  if (obj.teamFloors && typeof obj.teamFloors === 'object' && !Array.isArray(obj.teamFloors)) {
    let count = 0;
    for (const [rootId, floorId] of Object.entries(obj.teamFloors as Record<string, unknown>)) {
      if (count >= MAX_TEAM_FLOORS) break;
      const cleanRoot = typeof rootId === 'string' ? rootId.trim() : '';
      if (isSafeObjectKey(cleanRoot) && typeof floorId === 'string') {
        teamFloors[cleanRoot] = validFloorIds.has(floorId) ? floorId : fallbackFloorId;
        count += 1;
      }
    }
  }

  const hiddenAgents: string[] = [];
  const seenHidden = new Set<string>();
  if (Array.isArray(obj.hiddenAgents)) {
    for (const entry of obj.hiddenAgents) {
      if (hiddenAgents.length >= MAX_TEAM_FLOORS) break;
      const cleanId = typeof entry === 'string' ? entry.trim() : '';
      if (isSafeObjectKey(cleanId) && !seenHidden.has(cleanId)) {
        seenHidden.add(cleanId);
        hiddenAgents.push(cleanId);
      }
    }
  }

  return { floors, teamFloors: { ...teamFloors }, hiddenAgents };
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
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}
