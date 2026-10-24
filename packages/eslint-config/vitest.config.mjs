import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The fixtures contain *.test.ts(x) files that are lint subjects, not tests to run.
  test: { include: ['test/*.test.mjs'] },
});
