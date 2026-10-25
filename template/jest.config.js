const reactNativePreset = require('@react-native/jest-preset/jest-preset');

// Contract C4 aliases, kept in sync with tsconfig.json and babel.config.js.
const ALIAS_DIRS = [
  'app',
  'navigation',
  'features',
  'shared',
  'services',
  'theme',
  'assets',
  'locales',
  'config',
  'test-utils',
];
const aliasMapper = Object.fromEntries(
  ALIAS_DIRS.map((dir) => [`^@${dir}/(.*)$`, `<rootDir>/src/${dir}/$1`]),
);

const ESM_ONLY_PACKAGES =
  'msw|@msw/[^/]+|@mswjs/[^/]+|@open-draft/[^/]+|rettime|until-async|outvariant|strict-event-emitter|headers-polyfill|set-cookie-parser|tough-cookie|cookie|is-node-process';

// Packages shipped as untranspiled ESM/Flow that Jest must run through Babel.
const TRANSFORMED_PACKAGES = [
  'react-native',
  '@react-native',
  '@react-native-community',
  '@react-navigation',
  '@gorhom',
  '@shopify',
  '@d11',
  '@rozenite',
  'react-native-.*',
  'jest-react-native',
  ESM_ONLY_PACKAGES,
  'until-async',
  'rettime',
  'i18next',
  'react-i18next',
  'zustand',
  'test-renderer',
].join('|');

module.exports = {
  preset: '@react-native/jest-preset',
  // scripts/ uses node:test (`yarn test:ai-log`); e2e/ is Maestro.
  testPathIgnorePatterns: ['/node_modules/', '/scripts/', '/e2e/'],
  // Polyfills must exist before any module is evaluated.
  setupFiles: ['react-native-unistyles/mocks'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    ...reactNativePreset.moduleNameMapper,
    '\\.svg$': '<rootDir>/__mocks__/svgMock.tsx',
    ...aliasMapper,
  },
  transform: {
    // MSW and its interceptors are ESM-only and use syntax the React Native Babel preset rejects
    // (static class blocks, `import.meta`), so they get a plain Node-targeted CommonJS conversion instead.
    [`node_modules/(${ESM_ONLY_PACKAGES})/.+\\.m?js$`]: [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        plugins: [require.resolve('./__mocks__/importMetaPlugin.js')],
        presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
      },
    ],
    ...reactNativePreset.transform,
  },
  transformIgnorePatterns: [`node_modules/(?!(${TRANSFORMED_PACKAGES})/)`],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
    '!src/**/index.ts',
    '!src/test-utils/**',
  ],
  coverageThreshold: {
    global: { lines: 70, branches: 60, functions: 70, statements: 70 },
  },
};
