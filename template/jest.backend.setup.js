const { join } = require('node:path');

const { setupTempoBackend } = require('@rn-tempo/local-backend/test');

const { backendPort } = require('./jest.backend.port');

// One backend per test file, in memory and in test mode (no delays, no random faults, a fixed clock). The kit starts it
// in a beforeAll and stops it in an afterAll. TEMPO_BACKEND may name a team server (`https://host/b/name`, with
// TEMPO_BACKEND_KEY) instead of the committed folder.
setupTempoBackend({
  source: process.env.TEMPO_BACKEND ?? join(__dirname, 'backend'),
  apiKey: process.env.TEMPO_BACKEND_KEY,
  testMode: true,
  // The old mock handed out these exact strings and tests assert them. They exist only in this test process.
  testTokens: {
    username: 'emilys',
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  },
  // The port the react-native-config mock built API_BASE_URL from, known before the backend starts.
  port: backendPort(),
});
