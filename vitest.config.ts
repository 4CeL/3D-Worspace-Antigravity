import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@office/shared': path.resolve(__dirname, 'shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'hooks/**/*.test.ts',
      'server/src/**/*.test.ts',
      'client/src/**/*.test.{ts,tsx}',
    ],
    environmentMatchGlobs: [
      ['client/src/**/*.test.tsx', 'jsdom'],
    ],
  },
});
