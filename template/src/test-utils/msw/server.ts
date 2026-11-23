import { http, passthrough } from 'msw';
import { setupServer } from 'msw/node';

import { ENV } from '@config/env';

/**
 * Jest MSW server. The app's requests go to the Tempo local backend that `jest.backend.setup.js` starts for each test
 * file, so they pass through MSW. A test's `server.use(...)` override is tried first and wins over the backend.
 * Requests to any other host fail the test (`onUnhandledFrame: 'error'` in jest.setup.ts). Lifecycle (listen/reset/close)
 * is wired in jest.setup.ts.
 */
export const server = setupServer(
  http.all(`${new URL(ENV.API_BASE_URL).origin}/*`, () => passthrough()),
);
