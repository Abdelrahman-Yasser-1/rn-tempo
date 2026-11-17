import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { FieldIssue } from '@rn-tempo/api-contract';

import { adminAuthRoutes } from './admin-users.ts';
import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import { Manager, NotFoundError } from './manager.ts';
import { DefinitionError, type Collection } from './schema.ts';
import { readBody, sendReply, toCtx } from './server.ts';
import { MigrationConfirmError, MigrationError, UniqueViolationError, type Plan } from './store.ts';
import { validateRecord } from './values.ts';

/** Every admin route starts with this. The public listener has no route under it. */
export const ADMIN_PREFIX = '/__admin';
const MAX_ADMIN_BODY = 8 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

export interface AdminExtras {
  /** More routes (stats, OpenAPI), added by the caller. */
  routes?: AdminRoute[];
  keepAliveMs?: number;
}

export type AdminHandler = (ctx: RequestCtx, params: Record<string, string>) => Reply | Promise<Reply>;
export interface AdminRoute {
  method: string;
  pattern: string;
  handler: AdminHandler;
}

function sameToken(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenOf(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string' && /^Bearer /i.test(header)) return header.slice(7).trim();
  const custom = req.headers['x-tempo-token'];
  return typeof custom === 'string' ? custom : undefined;
}

/** Only loopback host names: a page on another origin that rebinds its DNS name to 127.0.0.1 still sends its own. */
function loopbackHost(req: IncomingMessage): boolean {
  const host = String(req.headers.host ?? '');
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

const planReply = (plan: Plan): unknown => ({ ok: true, ops: plan.ops.map((op) => op.op === 'createCollection' ? { op: op.op, collection: op.collection.name } : op) });

/** Turns what the manager and store throw into problem+json. */
export function errorReply(error: unknown): Reply {
  if (error instanceof DefinitionError) return problemReply(400, { detail: error.message.split('\n')[0] ?? 'Invalid definition.', errors: error.issues.map((issue): FieldIssue => ({ path: issue.path, message: issue.message })) });
  if (error instanceof MigrationConfirmError) return problemReply(409, { detail: error.message, extra: { confirmRequired: true, lost: error.lost } });
  if (error instanceof MigrationError) return problemReply(409, { detail: error.message });
  if (error instanceof UniqueViolationError) return problemReply(409, { detail: error.message, errors: [{ path: error.field === undefined ? 'body' : `body.${error.field}`, message: 'Already exists.' }] });
  if (error instanceof NotFoundError) return problemReply(404, { detail: error.message });
  process.stderr.write(`admin error: ${error instanceof Error ? error.message : String(error)}\n`);
  return problemReply(500, { detail: 'Unexpected server error.' });
}

function match(pattern: string, path: string): Record<string, string> | undefined {
  const want = pattern.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i += 1) {
    const w = want[i] ?? '';
    const g = got[i] ?? '';
    if (w.startsWith(':')) {
      try {
        params[w.slice(1)] = decodeURIComponent(g);
      } catch {
        return undefined;
      }
    } else if (w !== g) return undefined;
  }
  return params;
}

export interface AdminServer {
  server: Server;
  token: string;
}

/**
 * The admin listener: loopback only, a per-launch token on every route, no CORS. The caller binds it to
 * `127.0.0.1`; nothing here is reachable from the public port.
 */
export function createAdminServer(manager: Manager, extras: AdminExtras = {}, token: string = randomBytes(32).toString('hex')): AdminServer {
  const engine = manager.engine;
  const body = (ctx: RequestCtx): { ok: true; value: unknown } | { ok: false; reply: Reply } => readJson(ctx);
  const confirm = (ctx: RequestCtx): boolean => ctx.query.get('confirm') === 'true';

  const collectionOf = (name: string | undefined): Collection | undefined => engine.definition.collections.find((collection) => collection.name === name);
  const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);
  const noCollection = (name: string | undefined): Reply => problemReply(404, { detail: `No collection "${name ?? ''}".` });

  /** Runs a manager edit and answers with the plan, or the error. */
  const applying = async (run: () => Promise<Plan>): Promise<Reply> => {
    try {
      return jsonReply(200, planReply(await run()));
    } catch (error) {
      return errorReply(error);
    }
  };
  const withBody = (ctx: RequestCtx, use: (value: unknown) => Promise<Reply>): Promise<Reply> | Reply => {
    const parsed = body(ctx);
    return parsed.ok ? use(parsed.value) : parsed.reply;
  };
  const asObject = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

  const routes: AdminRoute[] = [
    { method: 'GET', pattern: '/info', handler: () => jsonReply(200, { name: engine.definition.name, startedAt: engine.startedAt, port: engine.definition.port, https: engine.definition.https, lastReloadError: manager.lastReloadError ?? null }) },
    // ---- definition
    { method: 'GET', pattern: '/definition', handler: () => jsonReply(200, manager.definition()) },
    { method: 'PUT', pattern: '/definition', handler: (ctx) => withBody(ctx, (value) => applying(() => manager.commit(value, { confirm: confirm(ctx) }))) },
    {
      method: 'POST',
      pattern: '/reload',
      handler: async () => {
        try {
          return jsonReply(200, { ok: true, ...(await manager.reloadFromDisk()) });
        } catch (error) {
          return errorReply(error);
        }
      },
    },
    // ---- endpoints
    { method: 'GET', pattern: '/endpoints', handler: () => jsonReply(200, manager.definition().endpoints ?? []) },
    { method: 'POST', pattern: '/endpoints', handler: (ctx) => withBody(ctx, (value) => applying(() => manager.addEndpoint(value as never))) },
    {
      method: 'GET',
      pattern: '/endpoints/:id',
      handler: (_ctx, params) => {
        const found = (manager.definition().endpoints ?? []).find((endpoint) => endpoint.id === params.id);
        return found === undefined ? problemReply(404, { detail: `No endpoint "${params.id ?? ''}".` }) : jsonReply(200, found);
      },
    },
    { method: 'PUT', pattern: '/endpoints/:id', handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.replaceEndpoint(params.id ?? '', value as never))) },
    { method: 'DELETE', pattern: '/endpoints/:id', handler: (_ctx, params) => applying(() => manager.removeEndpoint(params.id ?? '')) },
    // ---- collections and fields
    { method: 'GET', pattern: '/collections', handler: () => jsonReply(200, (manager.definition().collections ?? []).map((collection) => ({ ...collection, rows: engine.store.count(collection.name) }))) },
    { method: 'POST', pattern: '/collections', handler: (ctx) => withBody(ctx, (value) => applying(() => manager.addCollection(value as never, { confirm: confirm(ctx) }))) },
    {
      method: 'GET',
      pattern: '/collections/:name',
      handler: (_ctx, params) => {
        const found = (manager.definition().collections ?? []).find((collection) => collection.name === params.name);
        return found === undefined ? noCollection(params.name) : jsonReply(200, found);
      },
    },
    { method: 'DELETE', pattern: '/collections/:name', handler: (ctx, params) => applying(() => manager.removeCollection(params.name ?? '', { confirm: confirm(ctx) })) },
    {
      method: 'POST',
      pattern: '/collections/:name/rename',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.renameCollection(params.name ?? '', String(asObject(value).to ?? ''), { confirm: confirm(ctx) }))),
    },
    { method: 'POST', pattern: '/collections/:name/fields', handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.addField(params.name ?? '', value as never, { confirm: confirm(ctx) }))) },
    {
      method: 'PUT',
      pattern: '/collections/:name/fields/:field',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.updateField(params.name ?? '', params.field ?? '', value as never, { confirm: confirm(ctx) }))),
    },
    { method: 'DELETE', pattern: '/collections/:name/fields/:field', handler: (ctx, params) => applying(() => manager.removeField(params.name ?? '', params.field ?? '', { confirm: confirm(ctx) })) },
    {
      method: 'POST',
      pattern: '/collections/:name/fields/:field/rename',
      handler: (ctx, params) => withBody(ctx, (value) => applying(() => manager.renameField(params.name ?? '', params.field ?? '', String(asObject(value).to ?? ''), { confirm: confirm(ctx) }))),
    },
    // ---- data browser: every field, no endpoint rules
    {
      method: 'GET',
      pattern: '/data/:collection',
      handler: (ctx, params) => {
        const collection = collectionOf(params.collection);
        if (collection === undefined) return noCollection(params.collection);
        const number = (name: string, fallback: number): number => {
          const raw = ctx.query.get(name);
          return raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : fallback;
        };
        const names = new Set(['id', ...collection.fields.map((field) => field.name)]);
        const sortSpec = ctx.query.get('sort') ?? '';
        const sortName = sortSpec.replace(/^-/, '');
        const text = ctx.query.get('q') ?? '';
        const skip = number('skip', 0);
        const limit = number('limit', 50);
        const result = engine.store.list(collection.name, {
          skip,
          limit: Math.min(Math.max(limit, 1), 1000),
          ...(names.has(sortName) ? { sort: [{ field: sortName, desc: sortSpec.startsWith('-') }] } : {}),
          ...(text === '' ? {} : { search: { fields: collection.fields.filter((f) => f.type === 'string' || f.type === 'enum').map((f) => f.name), text } }),
        });
        return jsonReply(200, { rows: result.rows, total: result.total, skip, limit });
      },
    },
    {
      method: 'GET',
      pattern: '/data/:collection/:id',
      handler: (_ctx, params) => {
        const collection = collectionOf(params.collection);
        if (collection === undefined) return noCollection(params.collection);
        const id = wantId(params.id);
        const row = id === undefined ? undefined : engine.store.get(collection.name, id);
        return row === undefined ? problemReply(404, { detail: `No row ${params.id ?? ''}.` }) : jsonReply(200, row);
      },
    },
    ...(['POST', 'PUT', 'PATCH'] as const).map(
      (method): AdminRoute => ({
        method,
        pattern: method === 'POST' ? '/data/:collection' : '/data/:collection/:id',
        handler: (ctx, params) => {
          const collection = collectionOf(params.collection);
          if (collection === undefined) return noCollection(params.collection);
          const parsed = body(ctx);
          if (!parsed.ok) return parsed.reply;
          const id = method === 'POST' ? undefined : wantId(params.id);
          if (method !== 'POST' && (id === undefined || !engine.store.has(collection.name, id))) return problemReply(404, { detail: `No row ${params.id ?? ''}.` });
          const checked = validateRecord(collection, parsed.value, {
            mode: method === 'POST' ? 'create' : method === 'PUT' ? 'replace' : 'patch',
            unknownFields: 'reject',
            exists: (name, rowId) => engine.store.has(name, rowId),
          });
          if (checked.issues.length > 0) return problemReply(400, { detail: `${checked.issues[0]?.path ?? 'body'}: ${checked.issues[0]?.message ?? 'Invalid.'}`, errors: checked.issues });
          try {
            const row = id === undefined ? engine.store.insert(collection.name, checked.values) : engine.store.update(collection.name, id, checked.values);
            return jsonReply(method === 'POST' ? 201 : 200, row);
          } catch (error) {
            return errorReply(error);
          }
        },
      }),
    ),
    {
      method: 'DELETE',
      pattern: '/data/:collection/:id',
      handler: (_ctx, params) => {
        const collection = collectionOf(params.collection);
        if (collection === undefined) return noCollection(params.collection);
        const id = wantId(params.id);
        const row = id === undefined ? undefined : engine.store.get(collection.name, id);
        if (id === undefined || row === undefined) return problemReply(404, { detail: `No row ${params.id ?? ''}.` });
        engine.store.remove(collection.name, id);
        return jsonReply(200, row);
      },
    },
    // ---- scenarios
    {
      method: 'GET',
      pattern: '/scenarios',
      handler: () =>
        jsonReply(200, {
          active: engine.activeScenarios(),
          endpoints: engine.definition.endpoints.map((endpoint) => ({ id: endpoint.id, scenarios: engine.scenarioNames(endpoint) })),
        }),
    },
    {
      method: 'PUT',
      pattern: '/scenarios/:endpointId',
      handler: (ctx, params) => {
        const parsed = body(ctx);
        if (!parsed.ok) return parsed.reply;
        const name = asObject(parsed.value).name;
        if (typeof name !== 'string' || !engine.setScenario(params.endpointId ?? '', name)) {
          return problemReply(400, { detail: 'Send { "name" } of a scenario that exists on a known endpoint.' });
        }
        return jsonReply(200, { ok: true, active: engine.activeScenarios() });
      },
    },
    {
      method: 'DELETE',
      pattern: '/scenarios/:endpointId',
      handler: (_ctx, params) => {
        engine.clearScenario(params.endpointId);
        return jsonReply(200, { ok: true, active: engine.activeScenarios() });
      },
    },
    {
      method: 'DELETE',
      pattern: '/scenarios',
      handler: () => {
        engine.clearScenario();
        return jsonReply(200, { ok: true, active: {} });
      },
    },
    { method: 'GET', pattern: '/requests', handler: (ctx) => jsonReply(200, engine.requests.snapshot(Number(ctx.query.get('after') ?? 0) || 0)) },
    ...adminAuthRoutes(engine),
    ...(extras.routes ?? []),
  ];

  const keepAliveMs = extras.keepAliveMs ?? 15_000;

  function events(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const last = Number(req.headers['last-event-id']);
    const send = (entry: { id: number }): void => {
      if (res.writableLength > MAX_BUFFERED_BYTES) return void res.end();
      res.write(`id: ${entry.id}\nevent: request\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    res.write('retry: 2000\n\n');
    // Subscribing and reading the snapshot happen in one tick, so no entry is missed or sent twice.
    const unsubscribe = engine.requests.subscribe(send);
    for (const entry of engine.requests.snapshot(Number.isInteger(last) && last > 0 ? last : 0)) send(entry);
    const timer = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);
    res.on('close', () => {
      clearInterval(timer);
      unsubscribe();
    });
  }

  const server = createServer((req, res) => {
    void (async (): Promise<void> => {
      if (!loopbackHost(req)) return sendReply(res, problemReply(403, { detail: 'The admin API answers on 127.0.0.1 only.' }));
      if (!sameToken(tokenOf(req), token)) return sendReply(res, problemReply(401, { detail: 'Missing or wrong admin token.' }));
      const read = await readBody(req, MAX_ADMIN_BODY);
      if (!read.ok) return sendReply(res, problemReply(413, { title: 'Payload Too Large' }));
      const ctx = toCtx(req, read.text);
      if (!ctx.path.startsWith(`${ADMIN_PREFIX}/`)) return sendReply(res, problemReply(404, { detail: 'Not found.' }));
      const path = ctx.path.slice(ADMIN_PREFIX.length);
      if (ctx.method === 'GET' && path === '/events') return events(req, res);
      let known = false;
      for (const route of routes) {
        const params = match(route.pattern, path);
        if (params === undefined) continue;
        known = true;
        if (route.method !== ctx.method) continue;
        try {
          return sendReply(res, await route.handler(ctx, params));
        } catch (error) {
          return sendReply(res, errorReply(error));
        }
      }
      sendReply(res, known ? problemReply(405, { detail: 'Method not allowed.' }) : problemReply(404, { detail: 'Not found.' }));
    })();
  });
  return { server, token };
}

/** Every admin route as `METHOD /__admin/...`, for tests that check the public port never answers them. */
export function adminRouteList(extras: AdminExtras = {}): string[] {
  return [
    'GET /info', 'GET /definition', 'PUT /definition', 'POST /reload', 'GET /endpoints', 'POST /endpoints', 'GET /endpoints/x', 'PUT /endpoints/x',
    'DELETE /endpoints/x', 'GET /collections', 'POST /collections', 'GET /collections/x', 'DELETE /collections/x', 'POST /collections/x/rename',
    'POST /collections/x/fields', 'PUT /collections/x/fields/y', 'DELETE /collections/x/fields/y', 'POST /collections/x/fields/y/rename',
    'GET /data/x', 'GET /data/x/1', 'POST /data/x', 'PUT /data/x/1', 'PATCH /data/x/1', 'DELETE /data/x/1', 'GET /scenarios', 'PUT /scenarios/x',
    'DELETE /scenarios/x', 'DELETE /scenarios', 'GET /requests', 'GET /events',
    'GET /users', 'POST /users', 'GET /users/1', 'PUT /users/1', 'PATCH /users/1', 'DELETE /users/1', 'POST /users/1/password', 'POST /users/1/disable',
    'POST /users/1/enable', 'POST /users/1/revoke', 'GET /sessions', 'DELETE /sessions/1', ...(extras.routes ?? []).map((route) => `${route.method} ${route.pattern}`),
  ].map((entry) => entry.replace(' /', ` ${ADMIN_PREFIX}/`));
}
