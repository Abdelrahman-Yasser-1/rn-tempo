const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withRozenite } = require('@rozenite/metro');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * SVGs are imported as React components through react-native-svg-transformer.
 * Rozenite (DevTools plugins for TanStack Query, MMKV and network) is on outside production
 * bundles. The Storybook wrapper is added by WS4.
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
    // The MSW interceptors default to their Node build (`http`, `net`); the dev mock mode needs the
    // `browser` build, which only relies on fetch/XMLHttpRequest. Scoped so no other package changes.
    resolveRequest: (context, moduleName, platform) =>
      context.resolveRequest(
        moduleName.startsWith('@mswjs/interceptors')
          ? {
              ...context,
              unstable_conditionNames: [...context.unstable_conditionNames, 'browser'],
            }
          : context,
        moduleName,
        platform,
      ),
  },
};

module.exports = withRozenite(mergeConfig(defaultConfig, config), {
  enabled: process.env.NODE_ENV !== 'production',
});
