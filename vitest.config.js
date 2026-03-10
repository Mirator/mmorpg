import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./server/test/setup.js'],
    include: ['**/*.test.js', '**/*.integration.test.js'],
    exclude: ['**/node_modules/**', '**/output/**', '**/dist/**'],
    pool: 'threads',
    testTimeout: 15000,
    hookTimeout: 10000,
    sequence: {
      shuffle: false,
    },
    retry: 0,
  },
});
