import { appConfigRoutes } from './appConfig';
import { authRoutes } from './auth';
import { authExtraRoutes } from './authExtra';
import type { MockRoute } from './types';
import { userRoutes } from './users';

export { MOCK_ACCESS_TOKEN, MOCK_CREDENTIALS, MOCK_REFRESH_TOKEN, mockUser } from './auth';
export { mockAppConfig } from './appConfig';
export { matchPath, matchRoute, type RouteMatch } from './match';
export type { MockMethod, MockRequest, MockResponse, MockRoute } from './types';

/** The mock API: every endpoint, once, in match order. */
export const routes: MockRoute[] = [
  ...authRoutes,
  ...authExtraRoutes,
  ...userRoutes,
  ...appConfigRoutes,
];
