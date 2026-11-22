import { http, passthrough } from 'msw';
import { setupServer } from 'msw/node';

import { ENV } from '@config/env';

import { handlers } from './handlers';

/**
 * `yarn test:backend` (jest.backend.config.js): a Tempo local backend answers the requests to `ENV.API_BASE_URL`.
 * MSW stays on with its default handlers for every other host, and a test's `server.use(...)` override still wins over
 * the backend because overrides are tried first.
 */
// eslint-disable-next-line rn-tempo/restricted-syntax -- a Jest run switch set by jest.backend.config.js, not app configuration
const isBackendRun = process.env.TEMPO_TEST_SOURCE === 'backend';

const toBackend = isBackendRun
  ? [http.all(`${new URL(ENV.API_BASE_URL).origin}/*`, () => passthrough())]
  : [];

/** Jest MSW server. Lifecycle (listen/reset/close) is wired in jest.setup.ts. */
export const server = setupServer(...toBackend, ...handlers);
