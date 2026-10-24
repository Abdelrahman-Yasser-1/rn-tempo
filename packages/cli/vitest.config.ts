import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The e2e and generator tests copy the whole template; give them room.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
