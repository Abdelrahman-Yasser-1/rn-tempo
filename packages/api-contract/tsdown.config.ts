import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  // Consumers type their `data` functions from these declarations.
  dts: true,
});
