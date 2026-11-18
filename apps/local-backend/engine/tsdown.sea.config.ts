import { defineConfig } from 'tsdown';

// One file with every dependency inlined, the input of the single executable (see scripts/build-sea.mjs).
// Only Node's own modules stay outside it.
export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  outDir: 'dist-sea',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  dts: false,
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
});
