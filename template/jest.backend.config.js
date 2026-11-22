// `yarn test:backend`: the same suite as `yarn test`, answered by a Tempo local backend (backend/) that starts in memory
// inside each test file, in test mode, instead of by the MSW handlers of api/. MSW stays on: requests to the backend's
// address pass through to it, a test's `server.use(...)` override still wins, and other hosts keep their default handlers.
process.env.TEMPO_TEST_SOURCE = 'backend';

const base = require('./jest.config');

module.exports = {
  ...base,
  setupFilesAfterEnv: [...base.setupFilesAfterEnv, '<rootDir>/jest.backend.setup.js'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    // The built test kit (CommonJS) of the linked package; `yarn build:tools` builds it.
    '^@rn-tempo/local-backend/test$':
      '<rootDir>/node_modules/@rn-tempo/local-backend/dist/test.cjs',
  },
  // Starting a backend per test file adds time to a file's first test.
  testTimeout: 15000,
};
