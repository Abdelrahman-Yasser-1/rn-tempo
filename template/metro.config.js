const fs = require('node:fs');
const path = require('node:path');

const { getDefaultConfig } = require('@react-native/metro-config');
const { withRozenite } = require('@rozenite/metro');
// @tempo-feature:storybook:start
const { withStorybook } = require('@storybook/react-native/withStorybook');
// @tempo-feature:storybook:end

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Rozenite (DevTools plugins for TanStack Query, MMKV and network) is on outside production
 * bundles. Storybook replaces the app entry when STORYBOOK_ENABLED=true.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
let finalConfig = defaultConfig;

// @tempo-feature:storybook:start
// STORYBOOK_ENABLED=true swaps the entry to .rnstorybook/index.tsx; unset, Storybook code is stubbed.
finalConfig = withStorybook(finalConfig, {
  enabled: process.env.STORYBOOK_ENABLED === 'true',
  configPath: './.rnstorybook',
});
// @tempo-feature:storybook:end

// Inside the rn-tempo repository, @rn-tempo/api-contract and @rn-tempo/dev-api are `link:` packages
// from ../packages, outside the project root, and the dev mock mode (`API_MOCKING=true`) bundles
// them. Metro must watch them, and must resolve their imports (zod) from this project, so the app
// has one copy of each. A generated project installs them from npm, has no ../packages, and skips this.
const linkedPackages = ['api-contract', 'dev-api']
  .map((name) => path.resolve(__dirname, '../packages', name))
  .filter((folder) => fs.existsSync(path.join(folder, 'package.json')));
if (linkedPackages.length > 0) {
  finalConfig = {
    ...finalConfig,
    watchFolders: [...(finalConfig.watchFolders ?? []), ...linkedPackages],
    resolver: {
      ...finalConfig.resolver,
      nodeModulesPaths: [
        ...(finalConfig.resolver?.nodeModulesPaths ?? []),
        path.join(__dirname, 'node_modules'),
      ],
    },
  };
}

module.exports = withRozenite(finalConfig, {
  enabled: process.env.NODE_ENV !== 'production',
});
