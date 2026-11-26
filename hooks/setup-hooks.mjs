import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOOK_KEY,
  getDefaultHooksConfigPath,
  installHookConfig,
} from './hookConfig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emitScriptPath = path.resolve(__dirname, 'emit-event.cjs');

const configArgIdx = process.argv.indexOf('--config');
const configPath =
  configArgIdx !== -1 && process.argv[configArgIdx + 1]
    ? path.resolve(process.argv[configArgIdx + 1])
    : getDefaultHooksConfigPath();

try {
  const { backupPath } = installHookConfig(configPath, emitScriptPath);
  console.log(`\n✅ Hook "${HOOK_KEY}" berhasil dipasang!`);
  console.log(`   Config : ${configPath}`);
  console.log(`   Script : ${emitScriptPath}`);
  if (backupPath) {
    console.log(`   Backup : ${backupPath}`);
  }
  console.log('\nℹ️  Hook ini bersifat fail-open (<=150ms) dan tidak akan mengganggu Antigravity saat server 3D Office dimatikan.');
  console.log('   Jalankan `npm run dev` lalu buka browser untuk melihat kantor 3D-nya!\n');
} catch (err) {
  console.error('❌ Gagal memasang hook Antigravity:', err instanceof Error ? err.message : err);
  process.exit(1);
}
