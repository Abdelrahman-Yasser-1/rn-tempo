import { defineConfig } from 'tsdown';

// `tempo-api` keeps its shebang; `index` is the programmatic entry (createServer, generate).
export default defineConfig({
  entry: { 'tempo-api': 'src/bin.ts', index: 'src/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  dts: true,
});
