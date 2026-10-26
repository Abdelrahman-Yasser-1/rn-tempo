import { http, HttpResponse, type RequestHandler } from 'msw';

import { routes, type MockRoute } from '../routes';

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
    const { status, body: responseBody } = route.resolve({
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

/** Default MSW handlers for Jest, generated from the shared route table. */
export const handlers: RequestHandler[] = routes.map(toHandler);
