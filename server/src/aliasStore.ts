import fs from 'node:fs';
import path from 'node:path';

export function loadAliases(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAliases(filePath: string, aliases: Record<string, string>): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(aliases, null, 2) + '\n', 'utf-8');
}
