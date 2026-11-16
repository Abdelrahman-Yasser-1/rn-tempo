import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

import {
  mountedPath,
  problem,
  PROBLEM_CONTENT_TYPE,
  type ApiConfig,
  type EndpointDefinition,
  type ProblemDetails,
} from '@rn-tempo/api-contract';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Logger } from 'pino';

import { fallbackData } from '../data.ts';
import { createRuntime, type Runtime } from '../runtime/pipeline.ts';
import { BUILTIN_SCENARIOS, CONTROL_HEADER, findScenario, scenarioNames } from '../runtime/scenarios.ts';
import { docsRouter } from './docs.ts';
import { createLogger } from './logger.ts';
import { redactDeep, redactUrl } from './redact.ts';
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
  /** The request pipeline the routes call. */
  readonly runtime: Runtime;
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

  const runtime = createRuntime(config, {
    store,
    fallbackData: (endpoint, ctx) => fallbackData(endpoint, ctx, { seed: config.seed, fixturesDir: options.fixturesDir }),
    onError: (fields, message) => logger.error(fields, message),
  });
  const endpoints = runtime.endpoints;
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
      const names = scenarioNames(endpoint).join(', ');
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

  // ---- Swagger UI
  app.use('/docs', docsRouter(config));

  // ---- endpoints: one catch-all, because the runtime does the matching and the whole pipeline
  app.use(async (req, res, next) => {
    try {
      const result = await runtime.resolve({
        method: req.method,
        path: req.path,
        query: { ...req.query },
        body: req.body,
        headers: req.headers,
      });
      res.locals.responseBody = result.body;
      for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
      if (result.body === undefined) res.status(result.status).end();
      else res.status(result.status).send(JSON.stringify(result.body));
    } catch (error) {
      next(error);
    }
  });

  // ---- fallbacks
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') return sendProblem(res, problem(400, { detail: 'The request body is not valid JSON.' }));
    if (type === 'entity.too.large') return sendProblem(res, problem(413, { title: 'Payload Too Large' }));
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'unhandled error');
    sendProblem(res, problem(500, { detail: 'Unexpected server error.' }));
  });

  return { app, store, logger, controlToken, runtime, endpoints };
}
