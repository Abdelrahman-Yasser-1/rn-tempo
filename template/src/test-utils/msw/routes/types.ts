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
 * One mock API endpoint as a plain route, for the in-app axios adapter and for tests that pass their
 * own table. The app's endpoints are defined once in `api/endpoints` (see `api/README.md`); this
 * shape is derived from them. `path` uses `:param` segments and excludes the host.
 */
export type MockRoute = {
  method: MockMethod;
  path: string;
  resolve: (request: MockRequest) => MockResponse | Promise<MockResponse>;
};
