import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  ApiError,
  mountedPath,
  problem,
  PROBLEM_CONTENT_TYPE,
  validateRequest,
  validateResponse,
  type ApiConfig,
  type EndpointDefinition,
  type ProblemDetails,
  type Scenario,
} from '@rn-tempo/api-contract';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Logger } from 'pino';

import { resolveData } from '../data.ts';
import { bearerToken, mockAuthEndpoints } from './auth.ts';
import { createLogger } from './logger.ts';
import { redactDeep, redactUrl } from './redact.ts';
import { BUILTIN_SCENARIOS, CONTROL_HEADER, SCENARIO_HEADER } from './scenarios.ts';
import { Store } from './store.ts';

export interface ServerOptions {
  /** Where `db.json` lives. Defaults to `.tempo-api` in the working directory. */
  dataDir?: string;
  /** Folder of `<endpointId>.json` fixtures. Defaults to `fixtures` next to the config, when given. */
  fixturesDir?: string;
  logger?: Logger;
  /**
   * Secret for the internal control routes (`/__tempo/scenario`, `/__tempo/reset`). The CLI reads
   * it from a file in the data dir. A random one is used when omitted.
   */
  controlToken?: string;
}

export interface DevServer {
  readonly app: Express;
  readonly store: Store;
  readonly logger: Logger;
  readonly controlToken: string;
  /** Endpoints as served, with the mock-auth ones included. */
  readonly endpoints: readonly EndpointDefinition[];
}

const startedAt = new Date().toISOString();

function sendProblem(res: Response, body: ProblemDetails): void {
  // `message` repeats `detail` for clients written against dummyjson's `{ message }` errors.
  const payload = { ...body, message: body.detail ?? body.title };
  res.locals.responseBody = payload;
  res.status(body.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(payload));
}

function sendJson(res: Response, status: number, body: unknown): void {
  res.locals.responseBody = body;
  if (status === 204) res.status(204).end();
  else res.status(status).json(body);
}

/** Static segments before `:param` ones, so `/products/search` is tried before `/products/:id`. */
function routeOrder(endpoints: readonly EndpointDefinition[]): EndpointDefinition[] {
  const weight = (e: EndpointDefinition): number => e.path.split('/').filter((s) => s.startsWith(':')).length;
  return endpoints.map((e, i) => ({ e, i })).sort((a, b) => weight(a.e) - weight(b.e) || a.i - b.i).map(({ e }) => e);
}

function sameToken(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Builds the Express app for a config. Nothing listens here; see `listen`. Per request the order
 * is: check auth, validate, pick a scenario, compute data, check the data against the response
 * schema, send.
 */
export function createServer(config: ApiConfig, options: ServerOptions = {}): DevServer {
  const logger = options.logger ?? createLogger();
  const dataDir = options.dataDir ?? join(process.cwd(), '.tempo-api');
  const controlToken = options.controlToken ?? randomBytes(24).toString('hex');
  const store = new Store(config, dataDir, logger);

  const userRoutes = new Set(config.endpoints.map((e) => `${e.method} ${e.path}`));
  const authEndpoints = config.auth
    ? mockAuthEndpoints(store).filter((e) => !userRoutes.has(`${e.method} ${e.path}`))
    : [];
  const endpoints = [...config.endpoints, ...authEndpoints];
  const byId = new Map(endpoints.map((e) => [e.id, e]));

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Marks every response, so a mock is never mistaken for a real API.
  app.use((_req, res, next) => {
    res.setHeader('x-tempo-dev-api', 'mock-server-not-for-production');
    next();
  });

  // Request log. Bodies and headers are only logged at debug level, and always redacted.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const line = { method: req.method, url: redactUrl(req.originalUrl), status: res.statusCode, ms: Math.round(ms) };
      logger.info(line, 'request');
      if (logger.isLevelEnabled('debug')) {
        logger.debug(
          {
            ...line,
            req: { headers: redactDeep(req.headers), body: redactDeep(req.body) },
            res: { body: redactDeep(res.locals.responseBody) },
          },
          'request detail',
        );
      }
    });
    next();
  });

  // ---- internal routes
  const internal = express.Router();
  internal.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'tempo-dev-api',
      pid: process.pid,
      startedAt,
      scenarios: store.activeScenarios(),
    });
  });
  internal.get('/endpoints', (_req, res) => {
    res.json(
      endpoints.map((e) => ({
        id: e.id,
        method: e.method,
        path: mountedPath(config.basePath, e.path),
        auth: e.auth ?? null,
        summary: e.summary ?? null,
        tags: e.tags ?? [],
        scenarios: Object.keys({ ...BUILTIN_SCENARIOS, ...e.scenarios }),
      })),
    );
  });
  const control = (req: Request, res: Response, next: NextFunction): void => {
    if (sameToken(req.header(CONTROL_HEADER), controlToken)) next();
    else sendProblem(res, problem(401, { detail: 'Missing or wrong control token.' }));
  };
  internal.post('/scenario', control, (req, res) => {
    const body = (req.body ?? {}) as { endpointId?: unknown; name?: unknown; clear?: unknown };
    const endpointId = typeof body.endpointId === 'string' ? body.endpointId : undefined;
    if (body.clear === true) {
      if (endpointId !== undefined && !byId.has(endpointId)) {
        return sendProblem(res, problem(404, { detail: `Unknown endpoint "${endpointId}".` }));
      }
      store.clearScenario(endpointId);
      return void res.json({ ok: true, scenarios: store.activeScenarios() });
    }
    const endpoint = endpointId === undefined ? undefined : byId.get(endpointId);
    if (endpoint === undefined || typeof body.name !== 'string') {
      return sendProblem(res, problem(400, { detail: 'Send { endpointId, name } of a known endpoint.' }));
    }
    if (findScenario(endpoint, body.name) === undefined) {
      const names = Object.keys({ ...BUILTIN_SCENARIOS, ...endpoint.scenarios }).join(', ');
      return sendProblem(res, problem(400, { detail: `Unknown scenario "${body.name}". Available: ${names}.` }));
    }
    store.setScenario(endpoint.id, body.name);
    res.json({ ok: true, scenarios: store.activeScenarios() });
  });
  internal.post('/reset', control, (_req, res) => {
    store.reset();
    res.json({ ok: true });
  });
  app.use('/__tempo', internal);

  // ---- endpoints
  const router = express.Router();
  for (const endpoint of routeOrder(endpoints)) {
    const method = endpoint.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    router[method](endpoint.path, (req, res) => handle(endpoint, req, res));
  }
  app.use(config.basePath === '' ? '/' : config.basePath, router);

  async function handle(endpoint: EndpointDefinition, req: Request, res: Response): Promise<void> {
    // 1. auth first, so a caller without a token learns nothing about the request shape
    if (endpoint.auth === 'bearer') {
      const token = bearerToken(req.headers.authorization);
      if (token === undefined || store.findToken(token, 'access') === undefined) {
        res.setHeader('www-authenticate', 'Bearer');
        return sendProblem(res, problem(401, { detail: 'Missing or invalid access token.' }));
      }
    }

    // 2. validate
    const checked = validateRequest(endpoint, { params: { ...req.params }, query: { ...req.query }, body: req.body });
    if (!checked.ok) return sendProblem(res, checked.problem);

    // 3. scenario: the header wins over the one set through the store
    const headerName = req.header(SCENARIO_HEADER);
    const name = headerName ?? store.scenarioFor(endpoint.id);
    let scenario: Scenario | undefined;
    if (name !== undefined) {
      scenario = findScenario(endpoint, name);
      if (scenario === undefined && headerName !== undefined) {
        const names = Object.keys({ ...BUILTIN_SCENARIOS, ...endpoint.scenarios }).join(', ');
        return sendProblem(res, problem(400, { detail: `Unknown scenario "${headerName}". Available: ${names}.` }));
      }
    }
    if (scenario?.delayMs !== undefined) await sleep(scenario.delayMs);
    let status = endpoint.status;
    if (scenario?.status !== undefined) status = scenario.status;
    if (scenario?.body !== undefined) return sendJson(res, status, scenario.body);
    if (scenario?.status !== undefined && scenario.status >= 400) return sendProblem(res, problem(scenario.status));

    // 4. data
    let value: unknown;
    try {
      value = await resolveData(
        endpoint,
        {
          params: checked.value.params as Record<string, string>,
          query: checked.value.query as Record<string, unknown>,
          body: checked.value.body as undefined,
          headers: req.headers,
          db: store.db,
        },
        { seed: config.seed, fixturesDir: options.fixturesDir },
      );
    } catch (error) {
      if (error instanceof ApiError) return sendProblem(res, error.toProblem());
      logger.error({ endpoint: endpoint.id, err: error instanceof Error ? error.message : String(error) }, 'data failed');
      return sendProblem(
        res,
        problem(500, {
          title: 'Endpoint data failed',
          detail: `${endpoint.id}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }

    // 5. never send data the response schema rejects
    const response = validateResponse(endpoint, value);
    if (!response.ok) {
      logger.error({ endpoint: endpoint.id, issues: response.issues }, 'response does not match its schema');
      return sendProblem(
        res,
        problem(500, {
          title: 'Response does not match its schema',
          detail: `The data for ${endpoint.id} does not match its response schema. Fix the endpoint's data function or its fixture.`,
          errors: response.issues,
        }),
      );
    }
    sendJson(res, status, value);
  }

  // ---- fallbacks
  app.use((_req, res) => sendProblem(res, problem(404, { detail: 'No endpoint matches this request.' })));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') return sendProblem(res, problem(400, { detail: 'The request body is not valid JSON.' }));
    if (type === 'entity.too.large') return sendProblem(res, problem(413, { title: 'Payload Too Large' }));
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'unhandled error');
    sendProblem(res, problem(500, { detail: 'Unexpected server error.' }));
  });

  return { app, store, logger, controlToken, endpoints };
}

/** An endpoint's own scenario, or a built-in one of that name. */
function findScenario(endpoint: EndpointDefinition, name: string): Scenario | undefined {
  return endpoint.scenarios[name] ?? BUILTIN_SCENARIOS[name];
}
