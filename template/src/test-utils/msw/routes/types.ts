export type MockMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** What a route sees of the incoming request. Header names are lower-cased. */
export type MockRequest = {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
};

export type MockResponse = {
  status: number;
  body: unknown;
};

/**
 * One mock API endpoint, written once and consumed twice: MSW handlers for Jest, and the in-app
 * axios adapter for dev builds. `path` uses `:param` segments and excludes the host.
 */
export type MockRoute = {
  method: MockMethod;
  path: string;
  resolve: (request: MockRequest) => MockResponse;
};
