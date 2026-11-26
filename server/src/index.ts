import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOfficeServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.OFFICE_PORT || 4174);
const brainDir =
  process.env.ANTIGRAVITY_BRAIN_DIR ||
  path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const staticDir = path.resolve(__dirname, '../../client/dist');
const aliasFilePath = path.resolve(__dirname, '../data/agent-aliases.json');

const office = await createOfficeServer({
  port,
  host: '127.0.0.1',
  brainDir,
  staticDir,
  aliasFilePath,
});

console.log(`\n🏢 Antigravity 3D Office Telemetry Server aktif di http://${office.host}:${office.port}`);
console.log(`   Memantau brain dir : ${brainDir}`);
console.log(`   Endpoint hook      : POST http://${office.host}:${office.port}/api/hook-event`);
console.log(`   Tips: jalankan \`npm run setup-hooks\` sekali agar animasi berubah instan!\n`);

const shutdown = async () => {
  await office.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
