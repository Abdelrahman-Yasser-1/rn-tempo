import type { ApiConfig, EndpointDefinition } from '@rn-tempo/api-contract';

import { parseQuery } from './match.ts';
import { createRuntime, endpointUrlPath, type Runtime, type RuntimeOptions } from './pipeline.ts';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * The part of `msw` this helper uses. The app passes its own `http` and `HttpResponse`, so there
 * is one `msw` install and no import from this package. The result type comes from `http`.
 */
export interface MswLike<Handler> {
  http: Record<
    Method,
    (path: string, resolver: (info: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => Promise<Response>) => Handler
  >;
  HttpResponse: new (body: string | null, init: { status: number; headers: Record<string, string> }) => Response;
}

export interface MswOptions extends RuntimeOptions {
  /** Keep only these endpoints. Used to move an app over one domain at a time. */
  filter?: (endpoint: EndpointDefinition) => boolean;
  /** Reuse a runtime, for example to share its store. */
  runtime?: Runtime;
}

/**
 * One MSW handler per endpoint, answered by the runtime. Paths start with `*`, so any host
 * matches and the debug-menu base-URL override keeps working. Handlers are in match order, so
 * `/products/search` comes before `/products/:id`.
 */
export function toMswHandlers<Handler>(
  config: ApiConfig,
  msw: MswLike<Handler>,
  options: MswOptions = {},
): Handler[] {
  const runtime = options.runtime ?? createRuntime(config, options);
  const keep = options.filter ?? (() => true);
  return runtime.endpoints.filter(keep).map((endpoint) => {
    const method = endpoint.method.toLowerCase() as Method;
    return msw.http[method](`*${endpointUrlPath(config, endpoint)}`, async ({ request, params }) => {
      const text = await request.text();
      let body: unknown = text === '' ? undefined : text;
      if (text !== '') {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }
      const queryAt = request.url.indexOf('?');
      const hashAt = request.url.indexOf('#');
      const search = queryAt < 0 ? '' : request.url.slice(queryAt + 1, hashAt < 0 ? undefined : hashAt);
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const pathParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        pathParams[key] = String(Array.isArray(value) ? value[0] : value);
      }
      const response = await runtime.resolveEndpoint(endpoint, pathParams, {
        method: request.method,
        path: new URL(request.url).pathname,
        query: parseQuery(search),
        body,
        headers,
      });
      return new msw.HttpResponse(response.body === undefined ? null : JSON.stringify(response.body), {
        status: response.status,
        headers: response.headers,
      });
    });
  });
}
