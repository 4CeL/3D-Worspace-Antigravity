import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const backendPort = process.env.OFFICE_PORT || '4174';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@office/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.OFFICE_CLIENT_PORT || 5173),
    proxy: {
      '/api': `http://127.0.0.1:${backendPort}`,
      '/ws': {
        target: `ws://127.0.0.1:${backendPort}`,
        ws: true,
      },
    },
  },
});
