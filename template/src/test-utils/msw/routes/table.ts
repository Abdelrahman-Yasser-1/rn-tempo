import { createRuntime } from '@rn-tempo/dev-api/runtime';

import config from '@api/tempo-api.config';

import type { MockMethod, MockRoute } from './types';

const runtime = createRuntime(config);

/**
 * The endpoints of `api/tempo-api.config.ts` as plain routes, in match order. Each route answers
 * through the dev API runtime, the same pipeline as the dev server and the Jest handlers.
 */
export const routes: MockRoute[] = runtime.endpoints.map((endpoint) => ({
  method: endpoint.method.toLowerCase() as MockMethod,
  path: endpoint.path,
  resolve: async (request) => {
    const { status, body } = await runtime.resolveEndpoint(endpoint, request.params, {
      method: endpoint.method,
      path: endpoint.path,
      query: request.query,
      body: request.body,
      headers: request.headers,
    });
    return { status, body };
  },
}));
