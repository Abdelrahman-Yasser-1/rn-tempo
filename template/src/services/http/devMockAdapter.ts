import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios, { AxiosError } from 'axios';

// Dev-only: this file is loaded through a guarded `require` in client.ts, so release bundles never
// contain it, nor the route table it pulls in.
/* eslint-disable boundaries/dependencies -- dev-only mock adapter, stripped from release */
import {
  matchRoute,
  routes as defaultRoutes,
  type MockMethod,
  type MockRequest,
} from '@test-utils/msw/routes';
/* eslint-enable boundaries/dependencies */

export const DEV_MOCK_LATENCY_MS = 300;

type MockRoutes = typeof defaultRoutes;

const METHODS: readonly MockMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

const isMockMethod = (method: string): method is MockMethod =>
  METHODS.some((candidate) => candidate === method);

/** Path without host or query, for matching against the route table. */
function pathOf(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? '';
  const full = /^https?:\/\//.test(url) ? url : `${config.baseURL ?? ''}${url}`;
  const withoutOrigin = full.replace(/^https?:\/\/[^/]+/, '');
  return withoutOrigin.split('?')[0] ?? '';
}

function queryOf(config: InternalAxiosRequestConfig): Record<string, string> {
  const query: Record<string, string> = {};
  const fromUrl = (config.url ?? '').split('?')[1];
  if (fromUrl) {
    for (const [key, value] of new URLSearchParams(fromUrl).entries()) {
      query[key] = value;
    }
  }
  const params: unknown = config.params;
  if (typeof params === 'object' && params !== null) {
    for (const [key, value] of Object.entries(params)) {
      query[key] = String(value);
    }
  }
  return query;
}

function bodyOf(data: unknown): unknown {
  if (typeof data !== 'string' || data === '') {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function headersOf(config: InternalAxiosRequestConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.headers.toJSON())) {
    headers[key.toLowerCase()] = String(value);
  }
  return headers;
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export type DevMockAdapterOptions = {
  /** Where unmatched requests go; defaults to the platform's real adapter. */
  fallback?: AxiosAdapter;
  /** Artificial delay so loading states are visible. */
  latencyMs?: number;
  routes?: MockRoutes;
};

/**
 * Axios adapter that answers requests from the shared mock route table (the same one the Jest MSW
 * handlers are generated from) and lets everything else reach the network.
 */
export function createDevMockAdapter({
  fallback,
  latencyMs = DEV_MOCK_LATENCY_MS,
  routes = defaultRoutes,
}: Readonly<DevMockAdapterOptions> = {}): AxiosAdapter {
  const realAdapter = fallback ?? axios.getAdapter(['xhr', 'fetch', 'http']);

  return async (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    const match = isMockMethod(method) ? matchRoute(routes, method, pathOf(config)) : null;
    if (!match) {
      return realAdapter(config);
    }

    await sleep(latencyMs);
    const request: MockRequest = {
      params: match.params,
      query: queryOf(config),
      body: bodyOf(config.data),
      headers: headersOf(config),
    };
    const { status, body } = match.route.resolve(request);
    const response: AxiosResponse = {
      data: body,
      status,
      statusText: String(status),
      headers: {},
      config,
      request: {},
    };
    const isValid = config.validateStatus?.(status) ?? (status >= 200 && status < 300);
    if (isValid) {
      return response;
    }
    throw new AxiosError(
      `Request failed with status code ${String(status)}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      response.request,
      response,
    );
  };
}
