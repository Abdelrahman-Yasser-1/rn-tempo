const reactNativePreset = require('@react-native/jest-preset/jest-preset');

const { jestModuleNameMapper } = require('./babel/aliases');

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
  setupFiles: ['react-native-unistyles/mocks', '<rootDir>/src/theme/unistyles.ts'],
  // jest.backend.setup.js starts a Tempo local backend (backend/) in memory for each test file, in test mode. The app's
  // requests go to it; a test's `server.use(...)` override still wins (see src/test-utils/msw/server.ts).
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/jest.backend.setup.js'],
  moduleNameMapper: {
    ...reactNativePreset.moduleNameMapper,
    ...jestModuleNameMapper(),
    // The built test kit (CommonJS) of the linked package; `yarn build:tools` builds it.
    '^@rn-tempo/local-backend/test$':
      '<rootDir>/node_modules/@rn-tempo/local-backend/dist/test.cjs',
  },
  // Starting a backend per test file adds time to a file's first test.
  testTimeout: 15000,
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
    // svgr output: one component per icon and the registries, built by `yarn assets`.
    '!src/assets/generated/**',
  ],
  // A ratchet: thresholds only go up. Raise them when coverage rises; never lower them to pass.
  coverageThreshold: {
    global: { lines: 80, branches: 70, functions: 80, statements: 80 },
  },
};
