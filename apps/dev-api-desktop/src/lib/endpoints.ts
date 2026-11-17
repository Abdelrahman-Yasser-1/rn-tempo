import type { EndpointSummary, HttpRequest } from '../client/types';

export const UNTAGGED = 'untagged';

export interface EndpointGroup {
  tag: string;
  items: EndpointSummary[];
}

/** True when the query (case-insensitive, every word) appears in the endpoint's method, path, summary, id or tags. */
export function matchesQuery(endpoint: EndpointSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return true;
  const haystack = [endpoint.method, endpoint.path, endpoint.summary ?? '', endpoint.id, ...endpoint.tags].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Groups by first tag (untagged last, groups alphabetical), keeping the server's order inside a group. */
export function groupEndpoints(endpoints: readonly EndpointSummary[], query: string): EndpointGroup[] {
  const groups = new Map<string, EndpointSummary[]>();
  for (const endpoint of endpoints) {
    if (!matchesQuery(endpoint, query)) continue;
    const tag = endpoint.tags[0] ?? UNTAGGED;
    groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
  }
  return [...groups.entries()]
    .map(([tag, items]) => ({ tag, items }))
    .sort((a, b) => (a.tag === UNTAGGED ? 1 : b.tag === UNTAGGED ? -1 : a.tag.localeCompare(b.tag)));
}

/** `:id` segments of an Express-style path. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

/** Fills `:param` segments. A missing value stays as `:name`, so the mistake is visible in the request. */
export function fillPath(path: string, values: Record<string, string>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined || value === '' ? whole : encodeURIComponent(value);
  });
}

export interface TryInput {
  endpoint: Pick<EndpointSummary, 'method' | 'path'>;
  params: Record<string, string>;
  /** Raw query string, with or without the leading `?`. */
  query: string;
  body: string;
  token: string;
  /** Run with this scenario for this one request, without changing the live one. */
  scenario?: string;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = (typeof METHODS)[number];

function asMethod(value: string): Method | null {
  const upper = value.toUpperCase();
  return METHODS.find((method) => method === upper) ?? null;
}

/** The request for the "Try it" panel, or an error message for the user. */
export function buildTryRequest(input: TryInput): { request: HttpRequest } | { error: string } {
  const method = asMethod(input.endpoint.method);
  if (method === null) return { error: `${input.endpoint.method} cannot be sent from here.` };
  const query = input.query.trim().replace(/^\?/, '');
  const path = `${fillPath(input.endpoint.path, input.params)}${query === '' ? '' : `?${query}`}`;
  const headers: [string, string][] = [['accept', 'application/json']];
  if (input.token.trim() !== '') headers.push(['authorization', `Bearer ${input.token.trim()}`]);
  if (input.scenario !== undefined && input.scenario !== '') headers.push(['x-tempo-scenario', input.scenario]);
  const wantsBody = method !== 'GET' && input.body.trim() !== '';
  if (wantsBody) {
    try {
      JSON.parse(input.body);
    } catch {
      return { error: 'The body is not valid JSON.' };
    }
    headers.push(['content-type', 'application/json']);
  }
  return { request: { method, path, headers, body: wantsBody ? input.body : null } };
}

/** Indents a JSON text. Anything else (HTML, plain text) is returned unchanged. */
export function prettyBody(text: string): string {
  if (text.trim() === '') return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The mock login endpoint: a POST whose path ends in `/auth/login`. */
export function findLoginEndpoint(endpoints: readonly EndpointSummary[]): EndpointSummary | undefined {
  return endpoints.find((endpoint) => endpoint.method === 'POST' && endpoint.path.endsWith('/auth/login'));
}

/** The dev API's public test account. It is a mock, not a real credential. */
export const MOCK_LOGIN_BODY = JSON.stringify({ username: 'emilys', password: 'emilyspass' });

/** The access token in a login response, when there is one. */
export function accessTokenFrom(body: string): string | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === 'object' && value !== null && 'accessToken' in value && typeof value.accessToken === 'string') {
      return value.accessToken;
    }
  } catch {
    // Not JSON.
  }
  return null;
}
