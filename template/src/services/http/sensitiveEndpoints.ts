import { SKIP_REFRESH_PATHS, toRequestPath } from './skipRefresh';

/**
 * Endpoints whose requests or responses carry credentials or personal data. Tools that record
 * traffic (the debug network log) must not keep them. Paths are matched exactly, without base URL
 * or query string; a `:name` segment matches any single segment (`/users/:id`).
 */
export const SENSITIVE_ENDPOINTS: readonly string[] = [
  ...SKIP_REFRESH_PATHS,
  '/auth/me',
  '/users/add',
  '/users/:id',
];

const SEGMENT = '[^/?#]+';
const AUTH_PREFIX = '/auth';
const ORIGIN = String.raw`(?:[a-z][\d+.a-z-]*://[^/]+)?`;

function escapeSegment(segment: string): string {
  return segment.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

function toPathPattern(endpoint: string, separator: string): string {
  return endpoint
    .split('/')
    .map((segment) => (segment.startsWith(':') ? SEGMENT : escapeSegment(segment)))
    .join(separator);
}

const PATH_PATTERNS = SENSITIVE_ENDPOINTS.map(
  (endpoint) => new RegExp(`^${toPathPattern(endpoint, '/')}$`, 'i'),
);

/** Repeated slashes collapse, a trailing slash goes, and case is ignored: the matcher fails closed. */
function normalizePath(path: string): string {
  const collapsed = path.replaceAll(/\/{2,}/g, '/');
  const trimmed =
    collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
  return trimmed.toLowerCase();
}

/**
 * True when a request URL (relative or absolute, with or without a query) hits a sensitive
 * endpoint. Anything under `/auth/` always counts, listed or not.
 */
export function isSensitiveEndpoint(url: string, baseURL?: string): boolean {
  const path = normalizePath(toRequestPath(url, baseURL));
  return (
    path === AUTH_PREFIX ||
    path.startsWith(`${AUTH_PREFIX}/`) ||
    PATH_PATTERNS.some((pattern) => pattern.test(path))
  );
}

/**
 * The same rules as patterns over `"<METHOD> <url>"` lines, the format of the network logger's
 * `ignoredPatterns`. An optional path prefix before the endpoint (an API version) is allowed.
 */
export function sensitiveEndpointPatterns(): RegExp[] {
  const head = String.raw`^\w+ ${ORIGIN}(?:/+[^/?#]+)*?`;
  const tail = String.raw`/*(?:[?#]|$)`;
  return [
    new RegExp(String.raw`${head}/+auth(?:[/?#]|$)`, 'i'),
    ...SENSITIVE_ENDPOINTS.map(
      (endpoint) => new RegExp(`${head}${toPathPattern(endpoint, '/+')}${tail}`, 'i'),
    ),
  ];
}
