// Minimal config from WS0; WS3 (task 3.1) adds mocks, MSW, aliases and coverage thresholds.
module.exports = {
  preset: '@react-native/jest-preset',
  // scripts/ uses node:test (`yarn test:ai-log`); e2e/ is Maestro.
  testPathIgnorePatterns: ['/node_modules/', '/scripts/', '/e2e/'],
};
