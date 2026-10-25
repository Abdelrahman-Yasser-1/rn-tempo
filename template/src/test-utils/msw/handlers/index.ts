import type { RequestHandler } from 'msw';

/** Default handlers shared by tests and the dev mock mode; each domain adds its own module here. */
export const handlers: RequestHandler[] = [];
