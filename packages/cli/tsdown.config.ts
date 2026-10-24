import { defineConfig } from 'tsdown';

// Two bins share one chunk graph; `dist/create.mjs` and `dist/tempo.mjs` keep their shebangs.
export default defineConfig({
  entry: { create: 'src/create.ts', tempo: 'src/tempo.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: false,
});
