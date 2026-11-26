import path from 'node:path';
import {
  HOOK_KEY,
  getDefaultHooksConfigPath,
  removeHookConfig,
} from './hookConfig.mjs';

const configArgIdx = process.argv.indexOf('--config');
const configPath =
  configArgIdx !== -1 && process.argv[configArgIdx + 1]
    ? path.resolve(process.argv[configArgIdx + 1])
    : getDefaultHooksConfigPath();

try {
  const { removed, backupPath } = removeHookConfig(configPath);
  if (removed) {
    console.log(`\n✅ Hook "${HOOK_KEY}" berhasil dihapus dari ${configPath}`);
    if (backupPath) {
      console.log(`   Backup : ${backupPath}`);
    }
    console.log('');
  } else {
    console.log(`\nℹ️  Hook "${HOOK_KEY}" tidak ditemukan di ${configPath} (sudah bersih).\n`);
  }
} catch (err) {
  console.error('❌ Gagal menghapus hook Antigravity:', err instanceof Error ? err.message : err);
  process.exit(1);
}
