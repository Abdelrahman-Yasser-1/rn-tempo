import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

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
import { RequestLog } from './events.ts';
import { buildInfo, type ServerInfoOptions } from './info.ts';
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
  /**
   * What `/__tempo/info` reports (project, scheme, port, LAN address, certificate). The process
   * that starts the server knows these; without them the route reports plain HTTP on the config port.
   */
  info?: ServerInfoOptions;
  /** Where `rootCA.pem` (the public CA, written by `tempo-api certs`) lives. Defaults to `<dataDir>/certs`. */
  certsDir?: string;
  /** Milliseconds between the keep-alive comments on `/__tempo/events`. Defaults to 15000. */
  keepAliveMs?: number;
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
  /** The last requests, redacted, and the listeners of the event stream. */
  readonly requests: RequestLog;
}

/** The public CA file `tempo-api certs` copies next to the leaf. It is the only file `/__tempo/ca.pem` reads. */
const CA_FILE_NAME = 'rootCA.pem';
const DEFAULT_KEEP_ALIVE_MS = 15_000;
/** The most rows `/__tempo/data` sends per collection. */
const DATA_ROWS_PER_COLLECTION = 500;
/** A client that lets this much pile up unread is dropped. */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

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
  const certsDir = options.certsDir ?? join(dataDir, 'certs');
  const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;
  const startedAt = new Date().toISOString();
  const store = new Store(config, dataDir, logger);
  const requests = new RequestLog();
  const info = buildInfo(
    options.info ?? { project: basename(process.cwd()), scheme: 'http', port: config.port, cert: { present: false } },
    startedAt,
  );

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
      // The control routes are polled by tools; keeping them out leaves the log for the app's traffic.
      if (!req.originalUrl.startsWith('/__tempo/')) {
        requests.record({
          ...line,
          scenario: typeof res.locals.scenario === 'string' ? res.locals.scenario : undefined,
          reqHeaders: req.headers,
          reqBody: req.body,
          resBody: res.locals.responseBody,
        });
      }
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
  internal.get('/info', (_req, res) => void res.json(info));

  // The stored `resource()` records, read-only, for the desktop app's Data screen. It needs the
  // control token and redacts like the request log does; at most `DATA_ROWS_PER_COLLECTION` rows each.
  internal.get('/data', control, (_req, res) => {
    const collections = Object.entries(store.snapshot()).map(([name, rows]) => ({
      name,
      total: rows.length,
      items: redactDeep(rows.slice(0, DATA_ROWS_PER_COLLECTION)),
    }));
    res.json({ collections });
  });

  // The public root CA, for a phone to download. Only the one fixed file is read, never a path from
  // the request, and a file that holds a private key block is refused.
  internal.get('/ca.pem', (_req, res) => {
    let pem: string;
    try {
      pem = readFileSync(join(certsDir, CA_FILE_NAME), 'utf8');
    } catch {
      return sendProblem(res, problem(404, { detail: 'No CA certificate. Run `tempo-api certs` first.' }));
    }
    if (/PRIVATE KEY/.test(pem)) {
      logger.error({ file: CA_FILE_NAME }, 'rootCA.pem holds a private key and was not served');
      return sendProblem(res, problem(404, { detail: 'No CA certificate. Run `tempo-api certs` first.' }));
    }
    res.type('application/x-pem-file').setHeader('content-disposition', 'attachment; filename="tempo-dev-ca.pem"');
    res.send(pem);
  });

  // Server-sent events: the kept entries first, then each new one. `Last-Event-ID` (sent by a
  // reconnecting client) skips what it already has. A comment line every `keepAliveMs` keeps proxies
  // and idle timers from closing the stream; closing the request removes the listener and the timer.
  internal.get('/events', control, (req, res) => {
    res.status(200).set({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();
    const last = Number(req.header('last-event-id'));
    const send = (entry: { id: number }): void => {
      if (res.writableLength > MAX_BUFFERED_BYTES) return void res.end();
      res.write(`id: ${entry.id}\nevent: request\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    res.write('retry: 2000\n\n');
    // Subscribing and reading the snapshot happen in one tick, so no entry is missed or sent twice.
    const unsubscribe = requests.subscribe(send);
    for (const entry of requests.snapshot(Number.isInteger(last) && last > 0 ? last : 0)) send(entry);
    const timer = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);
    res.on('close', () => {
      clearInterval(timer);
      unsubscribe();
    });
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
      res.locals.scenario = result.scenario;
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

  return { app, store, logger, controlToken, runtime, endpoints, requests };
}
