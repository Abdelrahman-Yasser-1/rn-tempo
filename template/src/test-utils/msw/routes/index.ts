import { appConfigRoutes } from './appConfig';
import { definitionRoutes } from './fromDefinitions';
import type { MockRoute } from './types';
import { userRoutes } from './users';

export {
  MOCK_ACCESS_TOKEN,
  MOCK_CREDENTIALS,
  MOCK_REFRESH_TOKEN,
  MOCK_USER as mockUser,
} from '@api/endpoints/auth';
export { mockAppConfig } from './appConfig';
export { matchPath, matchRoute, type RouteMatch } from './match';
export type { MockMethod, MockRequest, MockResponse, MockRoute } from './types';

/** The mock API: every endpoint, once, in match order. */
export const routes: MockRoute[] = [
  // Defined in api/endpoints: auth, forgot password, OTP and products.
  ...definitionRoutes.filter((route) => /^\/(?:auth\/|products)/.test(route.path)),
  ...userRoutes,
  ...appConfigRoutes,
];
