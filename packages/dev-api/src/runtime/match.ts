import { normalizeBasePath, type EndpointDefinition } from '@rn-tempo/api-contract';

/** Matches `/items/:id` style patterns against a concrete path; returns the params or `null`. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter((part) => part !== '');
  const pathParts = path.split('/').filter((part) => part !== '');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? '';
    if (part.startsWith(':')) {
      try {
        params[part.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (part !== actual) {
      return null;
    }
  }
  return params;
}

/**
 * Orders endpoints so static segments are tried before `:param` ones: `/products/search` must win
 * over `/products/:id`. Endpoints with the same weight keep their order.
 */
export function orderEndpoints<T extends Pick<EndpointDefinition, 'path'>>(endpoints: readonly T[]): T[] {
  const weight = (endpoint: T): number => endpoint.path.split('/').filter((segment) => segment.startsWith(':')).length;
  return endpoints
    .map((endpoint, index) => ({ endpoint, index }))
    .sort((a, b) => weight(a.endpoint) - weight(b.endpoint) || a.index - b.index)
    .map(({ endpoint }) => endpoint);
}

/** Removes the base path from a request path, or returns `undefined` when it is not under it. */
export function stripBasePath(basePath: string, path: string): string | undefined {
  const base = normalizeBasePath(basePath);
  if (base === '') return path;
  if (path === base) return '/';
  return path.startsWith(`${base}/`) ? path.slice(base.length) : undefined;
}

/** Parses `a=1&b=2&b=3` into `{ a: '1', b: ['2', '3'] }`. A leading `?` is allowed. */
export function parseQuery(search: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const text = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of text.split('&')) {
    if (pair === '') continue;
    const equals = pair.indexOf('=');
    const decode = (value: string): string => {
      try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        return value;
      }
    };
    const key = decode(equals < 0 ? pair : pair.slice(0, equals));
    const value = equals < 0 ? '' : decode(pair.slice(equals + 1));
    const previous = out[key];
    if (previous === undefined) out[key] = value;
    else out[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
  }
  return out;
}
