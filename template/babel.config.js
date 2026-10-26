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
  presets: [
    'module:@react-native/babel-preset',
    // The RN preset leaves `export * as ns from` (used by Zod 4) to the CommonJS transform, which
    // rejects it. Opt in to just that one plugin; `node: current` keeps preset-env from touching
    // anything else, and `modules: false` leaves import/export handling to the RN preset.
    [
      '@babel/preset-env',
      {
        modules: false,
        targets: { node: 'current' },
        include: ['@babel/plugin-transform-export-namespace-from'],
      },
    ],
  ],
  plugins: [
    // Inlines `__APP_VERSION__` (src/config/constants.ts) from package.json.
    './babel/inline-app-version',
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
