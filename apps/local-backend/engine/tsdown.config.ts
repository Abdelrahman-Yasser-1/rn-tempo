import { defineConfig } from 'tsdown';

// `cli` is the `local-backend-engine` command; `index` is the programmatic entry. The workspace packages are
// bundled in because they ship TypeScript sources.
export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: false,
  dts: false,
  deps: { alwaysBundle: [/^@rn-tempo\//], onlyBundle: false },
});
