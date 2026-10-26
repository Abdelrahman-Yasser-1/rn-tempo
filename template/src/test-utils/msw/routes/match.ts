import type { MockMethod, MockRoute } from './types';

export type RouteMatch = { route: MockRoute; params: Record<string, string> };

/** Matches `/items/:id` style patterns against a concrete path; returns the params or `null`. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter((part) => part !== '');
  const pathParts = path.split('/').filter((part) => part !== '');
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? '';
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(actual);
    } else if (part !== actual) {
      return null;
    }
  }
  return params;
}

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
