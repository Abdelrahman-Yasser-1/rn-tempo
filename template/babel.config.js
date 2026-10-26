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
    // rejects it, and rejects static class blocks (used by the MSW interceptors). Opt in to just
    // those two plugins; `node: current` keeps preset-env from touching
    // anything else, and `modules: false` leaves import/export handling to the RN preset.
    [
      '@babel/preset-env',
      {
        modules: false,
        targets: { node: 'current' },
        include: [
          '@babel/plugin-transform-export-namespace-from',
          '@babel/plugin-transform-class-static-block',
        ],
      },
    ],
  ],
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
