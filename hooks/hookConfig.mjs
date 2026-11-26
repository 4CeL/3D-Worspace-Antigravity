import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOOK_KEY = 'antigravity-3d-office';

export function getDefaultHooksConfigPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
}

export function buildOfficeHookEntry(emitScriptAbsPath) {
  const command = `node "${emitScriptAbsPath}"`;
  const handler = { type: 'command', command, timeout: 5 };

  return {
    SessionStart: [{ ...handler }],
    PreInvocation: [{ ...handler }],
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ ...handler }],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [{ ...handler }],
      },
    ],
    Stop: [{ ...handler }],
  };
}

function readExistingConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { exists: false, data: {} };
  }
  const raw = fs.readFileSync(configPath, 'utf-8').trim();
  if (!raw) {
    return { exists: true, data: {} };
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid hooks.json format at ${configPath}: expected top-level JSON object.`);
  }
  return { exists: true, data: parsed };
}

function createBackup(configPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.${stamp}.bak`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

export function installHookConfig(configPath, emitScriptAbsPath) {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const { exists, data } = readExistingConfig(configPath);
  const backupPath = exists ? createBackup(configPath) : null;

  const updated = {
    ...data,
    [HOOK_KEY]: buildOfficeHookEntry(emitScriptAbsPath),
  };

  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { configPath, backupPath };
}

export function removeHookConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { removed: false, backupPath: null };
  }
  const { data } = readExistingConfig(configPath);
  if (!(HOOK_KEY in data)) {
    return { removed: false, backupPath: null };
  }

  const backupPath = createBackup(configPath);
  const updated = { ...data };
  delete updated[HOOK_KEY];

  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return { removed: true, backupPath };
}
