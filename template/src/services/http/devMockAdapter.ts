import { createRuntime, type Runtime } from '@rn-tempo/dev-api/runtime';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios, { AxiosError } from 'axios';

// Dev-only: this file is loaded through a guarded `require` in client.ts, so release bundles never
// contain it, nor the endpoint definitions and dev API runtime it pulls in.
/* eslint-disable boundaries/dependencies -- dev-only mock adapter, stripped from release */
import config from '@api/tempo-api.config';
import { matchRoute } from '@test-utils/msw/routes/match';
import type {
  MockMethod,
  MockRequest,
  MockResponse,
  MockRoute,
} from '@test-utils/msw/routes/types';
/* eslint-enable boundaries/dependencies -- end of the block disabled above */

export const DEV_MOCK_LATENCY_MS = 300;

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
  /** Answers from this route table instead of the app's endpoints (for tests of the adapter). */
  routes?: readonly MockRoute[];
};

let appRuntime: Runtime | undefined;

/** The runtime of the app's endpoint definitions, built on first use and kept for the session. */
function defaultRuntime(): Runtime {
  appRuntime ??= createRuntime(config);
  return appRuntime;
}

/**
 * Axios adapter that answers requests from the app's endpoint definitions (`api/`), through the
 * same runtime as the dev server and the Jest handlers, and lets everything else reach the network.
 */
export function createDevMockAdapter({
  fallback,
  latencyMs = DEV_MOCK_LATENCY_MS,
  routes,
}: Readonly<DevMockAdapterOptions> = {}): AxiosAdapter {
  const realAdapter = fallback ?? axios.getAdapter(['xhr', 'fetch', 'http']);

  return async (axiosConfig) => {
    const method = (axiosConfig.method ?? 'get').toLowerCase();
    const path = pathOf(axiosConfig);
    const answer = routes
      ? answerFromRoutes(routes, method, path)
      : answerFromRuntime(defaultRuntime(), method, path);

    if (!answer) {
      return realAdapter(axiosConfig);
    }

    await sleep(latencyMs);
    const request = {
      query: queryOf(axiosConfig),
      body: bodyOf(axiosConfig.data),
      headers: headersOf(axiosConfig),
    };
    const { status, body } = await answer(request);
    const response: AxiosResponse = {
      data: body,
      status,
      statusText: String(status),
      headers: {},
      config: axiosConfig,
      request: {},
    };
    const isValid = axiosConfig.validateStatus?.(status) ?? (status >= 200 && status < 300);
    if (isValid) {
      return response;
    }
    throw new AxiosError(
      `Request failed with status code ${String(status)}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      axiosConfig,
      response.request,
      response,
    );
  };
}

type Handler = (request: Omit<MockRequest, 'params'>) => Promise<MockResponse>;

/** A handler for a request that a route table matches, or `undefined` to let it reach the network. */
function answerFromRoutes(
  routes: readonly MockRoute[],
  method: string,
  path: string,
): Handler | undefined {
  const match = isMockMethod(method) ? matchRoute(routes, method, path) : null;
  return !match
    ? undefined
    : async (request) => match.route.resolve({ ...request, params: match.params });
}

/** A handler for a request that an endpoint of the runtime matches, or `undefined`. */
function answerFromRuntime(runtime: Runtime, method: string, path: string): Handler | undefined {
  if (!runtime.matches(method, path)) {
    return undefined;
  }
  return async (request) => {
    const { status, body } = await runtime.resolve({ method, path, ...request });
    return { status, body };
  };
}
