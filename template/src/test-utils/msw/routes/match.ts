import { matchPath } from '@rn-tempo/dev-api/runtime';

import type { MockMethod, MockRoute } from './types';

// The path matcher is the runtime's, so tests, MSW and the app match paths the same way.
export { matchPath };

export type RouteMatch = { route: MockRoute; params: Record<string, string> };

/** Finds the first route for a method and path. */
export function matchRoute(
  routes: readonly MockRoute[],
  method: MockMethod,
  path: string,
): RouteMatch | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const params = matchPath(route.path, path);
    if (params) {
      return { route, params };
    }
  }
  return null;
}
