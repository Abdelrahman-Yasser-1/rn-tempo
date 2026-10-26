import type { RequestHandler } from 'msw';

import { appConfigHandlers } from './appConfig';
import { authHandlers } from './auth';

/** Default handlers shared by tests and the dev mock mode; WS9 appends users, products and auth-extra. */
export const handlers: RequestHandler[] = [...authHandlers, ...appConfigHandlers];
