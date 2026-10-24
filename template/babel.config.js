// Path aliases: keep in sync with `paths` in tsconfig.json (contract C4).
const ALIASES = {
  '@app': './src/app',
  '@navigation': './src/navigation',
  '@features': './src/features',
  '@shared': './src/shared',
  '@services': './src/services',
  '@theme': './src/theme',
  '@assets': './src/assets',
  '@locales': './src/locales',
  '@config': './src/config',
  '@test-utils': './src/test-utils',
};

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Unistyles must see every file under src/ to wire styles to the C++ shadow tree.
    ['react-native-unistyles/plugin', { root: 'src' }],
    [
      'module-resolver',
      { root: ['./'], extensions: ['.ts', '.tsx', '.js', '.json'], alias: ALIASES },
    ],
    // Must stay last (Reanimated 4 / worklets requirement).
    'react-native-worklets/plugin',
  ],
};
