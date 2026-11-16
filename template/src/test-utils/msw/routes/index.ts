export {
  MOCK_ACCESS_TOKEN,
  MOCK_CREDENTIALS,
  MOCK_REFRESH_TOKEN,
  MOCK_USER as mockUser,
} from '@api/endpoints/auth';
export { MOCK_APP_CONFIG as mockAppConfig } from '@api/endpoints/appConfig';
export { matchPath, matchRoute, type RouteMatch } from './match';
// The app's endpoints as plain routes, derived from `api/` (nothing is written by hand here).
export { routes } from './table';
export type { MockMethod, MockRequest, MockResponse, MockRoute } from './types';
