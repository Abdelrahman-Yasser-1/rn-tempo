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

module.exports = withRozenite(finalConfig, {
  enabled: process.env.NODE_ENV !== 'production',
});
