// A plain Node project: Jest, axios, no React Native, no mock files. The only Tempo line is in setup.cjs.
const kitModules = process.env.TEMPO_KIT_NODE_MODULES;

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.spec.cjs'],
  setupFilesAfterEnv: ['<rootDir>/setup.cjs'],
  transform: {},
  // The staged copy of the published package (see scripts/run-kit-fixture.ts); a real project just installs it.
  moduleNameMapper: kitModules === undefined ? {} : { '^@rn-tempo/local-backend/test$': `${kitModules}/@rn-tempo/local-backend/dist/test.cjs` },
  testTimeout: 15000,
};
