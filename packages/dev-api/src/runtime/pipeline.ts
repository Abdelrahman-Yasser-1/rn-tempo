import {
  isApiError,
  problem,
  PROBLEM_CONTENT_TYPE,
  mountedPath,
  validateRequest,
  validateResponse,
  type AnyDataContext,
  type ApiConfig,
  type EndpointDefinition,
  type ProblemDetails,
  type RequestHeaders,
  type Scenario,
} from '@rn-tempo/api-contract';

import { matchPath, orderEndpoints, stripBasePath } from './match.ts';
import { mockAuthEndpoints, bearerToken } from './auth.ts';
import { findScenario, scenarioNames, SCENARIO_HEADER } from './scenarios.ts';
import { MemoryStore } from './store.ts';

/** A request, in the shape every host can build: MSW, the in-app axios adapter and Express. */
export interface RuntimeRequest {
  method: string;
  /** The URL path without host or query, base path included. */
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /** Header names in lower case. */
  headers?: RequestHeaders;
}

export interface RuntimeResponse {
  status: number;
  /** The JSON body. `undefined` for a 204. */
  body: unknown;
  /** `content-type` and, for a 401 from the bearer check, `www-authenticate`. */
  headers: Record<string, string>;
  /** The endpoint that answered, when one matched. */
  endpointId?: string;
}

export interface RuntimeOptions {
  /** Defaults to a new in-memory store. The server passes the one that persists to disk. */
  store?: MemoryStore;
  /**
   * Data for an endpoint that has no `data` function: fixture files and generated data. Both need
   * Node, so a host without them (Jest, the app) leaves this out and every endpoint defines `data`.
   */
  fallbackData?: (endpoint: EndpointDefinition, ctx: AnyDataContext) => unknown;
  /** Waits for a scenario's `delayMs`. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Called when a `data` function fails or returns something the response schema rejects. */
  onError?: (fields: Record<string, unknown>, message: string) => void;
}

export interface Runtime {
  readonly config: ApiConfig;
  readonly store: MemoryStore;
  /** Endpoints as served, in match order, with the mock-auth ones included. */
  readonly endpoints: readonly EndpointDefinition[];
  /** Whether an endpoint answers this method and path. Hosts use it to let other requests through. */
  matches(method: string, path: string): boolean;
  /** Runs the pipeline: auth, validate, scenario, data, response check. Never throws. */
  resolve(request: RuntimeRequest): Promise<RuntimeResponse>;
  /**
   * Runs the pipeline for an endpoint the host already matched, with the params it extracted. The
   * request path is ignored. MSW uses it: its `*` host pattern also matches URLs with a path prefix
   * (an API base URL such as `https://host/api/v1`), which `resolve` would not.
   */
  resolveEndpoint(endpoint: EndpointDefinition, params: Record<string, string>, request: RuntimeRequest): Promise<RuntimeResponse>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A problem+json body. `message` repeats `detail` for clients written against dummyjson's
 * `{ message }` errors.
 */
function problemResponse(body: ProblemDetails, headers: Record<string, string> = {}, endpointId?: string): RuntimeResponse {
  const payload = { ...body, message: body.detail ?? body.title };
  return {
    status: body.status,
    body: payload,
    headers: { ...headers, 'content-type': PROBLEM_CONTENT_TYPE },
    ...(endpointId === undefined ? {} : { endpointId }),
  };
}

function jsonResponse(status: number, body: unknown, endpointId: string): RuntimeResponse {
  if (status === 204) return { status, body: undefined, headers: {}, endpointId };
  return { status, body, headers: { 'content-type': 'application/json; charset=utf-8' }, endpointId };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The one request pipeline. The Express server, the MSW handlers and the in-app adapter all call
 * it, so they cannot disagree. It imports nothing from Node.
 */
export function createRuntime(config: ApiConfig, options: RuntimeOptions = {}): Runtime {
  const store = options.store ?? new MemoryStore(config);
  const sleep = options.sleep ?? defaultSleep;

  const userRoutes = new Set(config.endpoints.map((e) => `${e.method} ${e.path}`));
  const authEndpoints = config.auth
    ? mockAuthEndpoints(store).filter((e) => !userRoutes.has(`${e.method} ${e.path}`))
    : [];
  const endpoints = orderEndpoints([...config.endpoints, ...authEndpoints]);

  function find(method: string, path: string): { endpoint: EndpointDefinition; params: Record<string, string> } | undefined {
    const local = stripBasePath(config.basePath, path);
    if (local === undefined) return undefined;
    const upper = method.toUpperCase();
    for (const endpoint of endpoints) {
      if (endpoint.method !== upper) continue;
      const params = matchPath(endpoint.path, local);
      if (params !== null) return { endpoint, params };
    }
    return undefined;
  }

  async function run(endpoint: EndpointDefinition, params: Record<string, string>, request: RuntimeRequest): Promise<RuntimeResponse> {
    const headers = request.headers ?? {};

    // 1. auth first, so a caller without a token learns nothing about the request shape
    if (endpoint.auth === 'bearer') {
      const token = bearerToken(headers.authorization);
      if (token === undefined || store.findToken(token, 'access') === undefined) {
        return problemResponse(problem(401, { detail: 'Missing or invalid access token.' }), { 'www-authenticate': 'Bearer' }, endpoint.id);
      }
    }

    // 2. validate
    const checked = validateRequest(endpoint, { params, query: { ...request.query }, body: request.body });
    if (!checked.ok) return problemResponse(checked.problem, {}, endpoint.id);

    // 3. scenario: the header wins over the one set through the store
    const rawHeader = headers[SCENARIO_HEADER];
    const headerName = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const name = headerName ?? store.scenarioFor(endpoint.id);
    let scenario: Scenario | undefined;
    if (name !== undefined) {
      scenario = findScenario(endpoint, name);
      if (scenario === undefined && headerName !== undefined) {
        const detail = `Unknown scenario "${headerName}". Available: ${scenarioNames(endpoint).join(', ')}.`;
        return problemResponse(problem(400, { detail }), {}, endpoint.id);
      }
    }
    if (scenario?.delayMs !== undefined) await sleep(scenario.delayMs);
    let status = endpoint.status;
    if (scenario?.status !== undefined) status = scenario.status;
    if (scenario?.body !== undefined) return jsonResponse(status, scenario.body, endpoint.id);
    if (scenario?.status !== undefined && scenario.status >= 400) {
      return problemResponse(problem(scenario.status), {}, endpoint.id);
    }

    // 4. data
    let value: unknown;
    try {
      const ctx: AnyDataContext = {
        params: checked.value.params as Record<string, string>,
        query: checked.value.query as Record<string, unknown>,
        body: checked.value.body as undefined,
        headers,
        db: store.db,
      };
      if (endpoint.data !== undefined) value = await endpoint.data(ctx);
      else if (options.fallbackData !== undefined) value = await options.fallbackData(endpoint, ctx);
      else {
        throw new Error('it has no data function, and this host cannot generate data. Add `data` to the endpoint.');
      }
    } catch (error) {
      if (isApiError(error)) return problemResponse(error.toProblem(), {}, endpoint.id);
      options.onError?.({ endpoint: endpoint.id, err: errorMessage(error) }, 'data failed');
      return problemResponse(
        problem(500, { title: 'Endpoint data failed', detail: `${endpoint.id}: ${errorMessage(error)}` }),
        {},
        endpoint.id,
      );
    }

    // 5. never send data the response schema rejects
    const response = validateResponse(endpoint, value);
    if (!response.ok) {
      options.onError?.({ endpoint: endpoint.id, issues: response.issues }, 'response does not match its schema');
      return problemResponse(
        problem(500, {
          title: 'Response does not match its schema',
          detail: `The data for ${endpoint.id} does not match its response schema. Fix the endpoint's data function or its fixture.`,
          errors: response.issues,
        }),
        {},
        endpoint.id,
      );
    }
    return jsonResponse(status, value, endpoint.id);
  }

  return {
    config,
    store,
    endpoints,
    matches: (method, path) => find(method, path) !== undefined,
    resolveEndpoint: (endpoint, params, request) => run(endpoint, params, request),
    async resolve(request) {
      const found = find(request.method, request.path);
      if (found === undefined) return problemResponse(problem(404, { detail: 'No endpoint matches this request.' }));
      return run(found.endpoint, found.params, request);
    },
  };
}

/** The URL path an endpoint is served on, for hosts that register one route per endpoint. */
export function endpointUrlPath(config: ApiConfig, endpoint: EndpointDefinition): string {
  return mountedPath(config.basePath, endpoint.path);
}
