import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The CLI integration test spawns real server processes.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
