import { appConfigRoutes } from './appConfig';
import { authRoutes } from './auth';
import type { MockRoute } from './types';

export { MOCK_ACCESS_TOKEN, MOCK_CREDENTIALS, MOCK_REFRESH_TOKEN, mockUser } from './auth';
export { mockAppConfig } from './appConfig';
export { matchPath, matchRoute, type RouteMatch } from './match';
export type { MockMethod, MockRequest, MockResponse, MockRoute } from './types';

/** The mock API. WS9 appends users, products and auth-extra routes here, once each. */
export const routes: MockRoute[] = [...authRoutes, ...appConfigRoutes];
