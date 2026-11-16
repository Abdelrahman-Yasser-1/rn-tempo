import { http, HttpResponse, type RequestHandler } from 'msw';

import { createHandlers } from '@api/generated/msw-handlers';
import { routes, type MockRoute } from '@test-utils/msw/routes';

/** Wildcard hosts keep the debug-menu API URL override working against the mocks. */
export function toHandler(route: MockRoute): RequestHandler {
  return http[route.method](`*${route.path}`, async ({ request, params }) => {
    const text = await request.text();
    let body: unknown = text;
    try {
      body = text === '' ? undefined : JSON.parse(text);
    } catch {
      body = text;
    }
    const url = new URL(request.url);
    const { status, body: responseBody } = await route.resolve({
      params: Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
      ),
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      headers: Object.fromEntries([...request.headers.entries()]),
    });
    return HttpResponse.json(responseBody as Record<string, unknown>, { status });
  });
}

/** Domains already answered by the handlers generated from `api/`; the rest still use `routes`. */
const generated = createHandlers({ filter: (endpoint) => endpoint.path.startsWith('/auth/') });

/** Default MSW handlers for Jest. */
export const handlers: RequestHandler[] = [
  ...generated,
  ...routes.filter((route) => !route.path.startsWith('/auth/')).map(toHandler),
];
