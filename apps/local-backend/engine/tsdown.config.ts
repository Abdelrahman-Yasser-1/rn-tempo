import { defineConfig } from 'tsdown';

// `cli` is the `local-backend-engine` command; `index` is the programmatic entry. The workspace packages are
// bundled in because they ship TypeScript sources.
// `test` is the Jest test kit (`@rn-tempo/local-backend/test`): CommonJS for Jest's `require`, ESM for Vitest, and types.
const shared = { platform: 'node' as const, target: 'node24', clean: false, deps: { alwaysBundle: [/^@rn-tempo\//], onlyBundle: false as const } };

export default defineConfig([
  { ...shared, entry: { cli: 'src/cli.ts', index: 'src/index.ts' }, format: 'esm', dts: false },
  { ...shared, entry: { test: 'src/test-kit/index.ts' }, format: ['esm', 'cjs'], dts: true },
]);
