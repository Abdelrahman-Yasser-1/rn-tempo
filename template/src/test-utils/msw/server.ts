import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Jest MSW server. Lifecycle (listen/reset/close) is wired in jest.setup.ts. */
export const server = setupServer(...handlers);
