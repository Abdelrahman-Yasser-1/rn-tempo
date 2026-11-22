import type { IncomingHttpHeaders } from 'node:http';

import type { Cors } from './schema.ts';

const DEFAULT_REQUEST_HEADERS = ['content-type', 'authorization', 'accept', 'x-tempo-scenario', 'x-tempo-test-mode', 'x-tempo-test-delays', 'x-tempo-test-faults', 'x-tempo-access-key'];
const DEFAULT_EXPOSED = ['retry-after', 'ratelimit', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'ratelimit-policy'];

export interface CorsResult {
  /** Headers to add to the answer (empty when the request is not cross-origin or its origin is not allowed). */
  headers: Record<string, string>;
  /** An `OPTIONS` request that asks permission (`Access-Control-Request-Method`): answer 204 with these headers and stop. */
  preflight: boolean;
}

const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * The CORS headers of one request. Without a `cors` setting nothing is added (the backend's long-standing behaviour: a
 * browser app on another origin is blocked). An origin list reflects the matching origin and says `Vary: Origin`; `*` never
 * goes with credentials (the schema refuses that combination).
 */
export function corsFor(cors: Cors | undefined, method: string, headers: IncomingHttpHeaders): CorsResult {
  const none: CorsResult = { headers: {}, preflight: false };
  const origin = one(headers.origin);
  if (cors === undefined || origin === undefined) return none;
  const preflight = method === 'OPTIONS' && one(headers['access-control-request-method']) !== undefined;
  const allowed = cors.origins === '*' || cors.origins.includes(origin);
  if (!allowed) return { headers: { vary: 'Origin' }, preflight };
  const out: Record<string, string> = {
    'access-control-allow-origin': cors.origins === '*' ? '*' : origin,
    ...(cors.origins === '*' ? {} : { vary: 'Origin' }),
    ...(cors.credentials ? { 'access-control-allow-credentials': 'true' } : {}),
  };
  if (preflight) {
    out['access-control-allow-methods'] = cors.methods.join(', ');
    out['access-control-allow-headers'] = (cors.headers ?? DEFAULT_REQUEST_HEADERS).join(', ');
    out['access-control-max-age'] = String(cors.maxAge);
  } else {
    out['access-control-expose-headers'] = (cors.exposeHeaders ?? DEFAULT_EXPOSED).join(', ');
  }
  return { headers: out, preflight };
}
