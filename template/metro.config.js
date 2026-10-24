const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withRozenite } = require('@rozenite/metro');
// @tempo-feature:storybook:start
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
// @tempo-feature:storybook:end

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * SVGs are imported as React components through react-native-svg-transformer.
 * Rozenite (DevTools plugins for TanStack Query, MMKV and network) is on outside production
 * bundles. Storybook replaces the app entry when STORYBOOK_ENABLED=true.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer/react-native'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg'],
  },
};

let finalConfig = mergeConfig(defaultConfig, config);

// @tempo-feature:storybook:start
// With STORYBOOK_ENABLED unset, Metro swaps Storybook imports for empty modules.
finalConfig = withStorybook(finalConfig, {
  enabled: process.env.STORYBOOK_ENABLED === 'true',
  configPath: './.rnstorybook',
});
// @tempo-feature:storybook:end

module.exports = withRozenite(finalConfig, {
  enabled: process.env.NODE_ENV !== 'production',
});
