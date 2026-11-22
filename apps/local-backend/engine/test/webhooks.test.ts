import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auditSummary } from '../src/audit.ts';
import { EventBus } from '../src/events.ts';
import { checkOutboundUrl, OutboundError, type OutboundResponse, type Transport } from '../src/outbound.ts';
import { ADMIN_ROLE_TABLE, decide } from '../src/roles.ts';
import { parseBackend, type Backend, type BackendInput } from '../src/schema.ts';
import { SecretStore } from '../src/secrets.ts';
import { buildTestSnapshot } from '../src/test-snapshot.ts';
import { renderTemplate, signPayload, verifySignature, WebhookService } from '../src/webhooks.ts';

import { serve, stopAll } from './helpers.ts';
import { endpoints } from './realtime-helpers.ts';

afterEach(async () => {
  vi.useRealTimers();
  await stopAll();
});

const hook = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'orders', url: 'http://127.0.0.1:9/hook', events: ['products.*'], ...extra });
const definitionOf = (hooks: Record<string, unknown>[]): Backend => parseBackend({ name: 'w', webhooks: hooks });

interface Rig {
  service: WebhookService;
  events: EventBus;
  db: DatabaseSync;
  secrets: SecretStore;
  sent: { url: string; headers: Record<string, string>; body: string }[];
  setDefinition: (hooks: Record<string, unknown>[]) => void;
}

function rig(options: { transport?: Transport; testMode?: boolean; policy?: { allowPrivate: boolean; requireHttps: boolean }; db?: DatabaseSync; dir?: string; hooks?: Record<string, unknown>[] } = {}): Rig {
  const db = options.db ?? new DatabaseSync(':memory:');
  const secrets = new SecretStore(options.dir ?? mkdtempSync(join(tmpdir(), 'wh-')));
  const events = new EventBus();
  let definition = definitionOf(options.hooks ?? [hook()]);
  const sent: Rig['sent'] = [];
  const transport: Transport =
    options.transport ??
    ((request): Promise<OutboundResponse> => {
      sent.push({ url: request.url, headers: request.headers, body: String(request.body) });
      return Promise.resolve({ status: 200, body: 'ok' });
    });
  const service = new WebhookService({
    db,
    definition: () => definition,
    events,
    secrets,
    now: () => new Date(),
    policy: options.policy ?? { allowPrivate: true, requireHttps: false },
    testMode: options.testMode ?? false,
    transport: options.testMode === true && options.transport === undefined ? (undefined as unknown as Transport) : transport,
    random: () => 0,
  });
  service.start();
  return { service, events, db, secrets, sent, setDefinition: (hooks) => void (definition = definitionOf(hooks)) };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('webhook signing', () => {
  it('AC-LP-8 signs "t.body" with HMAC-SHA256 as t=<unix>,v1=<hex> and a receiver can verify it', () => {
    const header = signPayload('whsec_test', 1_700_000_000, '{"a":1}');
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature('whsec_test', header, '{"a":1}')).toBe(true);
    expect(verifySignature('whsec_test', header, '{"a":2}')).toBe(false);
    expect(verifySignature('other', header, '{"a":1}')).toBe(false);
    expect(verifySignature('whsec_test', header, '{"a":1}', { toleranceSec: 300, nowSec: 1_700_000_000 + 301 })).toBe(false);
    expect(verifySignature('whsec_test', header, '{"a":1}', { toleranceSec: 300, nowSec: 1_700_000_100 })).toBe(true);
  });

  it('AC-LP-8 fills {{event.*}} in a body template and keeps the type of a lone placeholder', () => {
    const event = { id: 'evt_1', name: 'products.created', createdAt: '2025-01-01T00:00:00.000Z', data: { record: { id: 7, title: 'Lamp' } } };
    expect(renderTemplate({ text: 'New {{event.data.record.title}} ({{event.name}})', id: '{{event.data.record.id}}', nope: '{{event.data.x.y}}' }, event)).toEqual({ text: 'New Lamp (products.created)', id: 7, nope: null });
  });
});

describe('webhook delivery queue', () => {
  it('AC-LP-8 sends the default body { id, event, createdAt, data } with the three headers and a valid signature', async () => {
    const r = rig();
    r.events.emit('products.created', { collection: 'products', id: 1, record: { id: 1, title: 'Lamp' } });
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    const [call] = r.sent;
    const body = JSON.parse(call?.body ?? '{}') as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'data', 'event', 'id']);
    expect(body.event).toBe('products.created');
    expect(call?.headers['x-tempo-event']).toBe('products.created');
    expect(call?.headers['x-tempo-delivery']).toMatch(/^whd_/);
    const secret = String(r.secrets.section('webhooks').orders);
    expect(verifySignature(secret, call?.headers['x-tempo-signature'] ?? '', call?.body ?? '')).toBe(true);
    // Events the webhook does not list are not sent.
    r.events.emit('users.created', {});
    await flush();
    expect(r.sent).toHaveLength(1);
    r.service.close();
  });

  it('AC-LP-8 retries with exponential backoff and gives up after retries.max (fake timers)', async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    const transport: Transport = () => {
      times.push(Date.now());
      return Promise.resolve({ status: 503, body: 'down' });
    };
    const r = rig({ transport, hooks: [hook({ retries: { max: 2, baseMs: 1000 } })] });
    const start = Date.now();
    r.events.emit('products.created', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(times).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(times).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(times).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toHaveLength(3);
    expect(times.map((t) => t - start)).toEqual([0, 1000, 3000]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(times).toHaveLength(3);
    const [delivery] = r.service.deliveries();
    expect(delivery?.status).toBe('failed');
    expect(delivery?.attempts.map((a) => [a.n, a.code, a.response])).toEqual([[1, 503, 'down'], [2, 503, 'down'], [3, 503, 'down']]);
    r.service.close();
  });

  it('AC-LP-8 truncates a response body to 2 KB in the log', async () => {
    const transport: Transport = () => Promise.resolve({ status: 500, body: 'x'.repeat(5000) });
    const r = rig({ transport, hooks: [hook({ retries: { max: 0 } })] });
    r.events.emit('products.created', {});
    await vi.waitFor(() => expect(r.service.deliveries()[0]?.status).toBe('failed'));
    expect(r.service.deliveries()[0]?.attempts[0]?.response).toHaveLength(2048);
    r.service.close();
  });

  it('AC-LP-8 resumes pending deliveries after a restart', async () => {
    vi.useFakeTimers();
    const db = new DatabaseSync(':memory:');
    const dir = mkdtempSync(join(tmpdir(), 'wh-'));
    const first = rig({ db, dir, transport: () => Promise.resolve({ status: 500, body: '' }), hooks: [hook({ retries: { max: 3, baseMs: 5000 } })] });
    first.events.emit('products.created', { collection: 'products', id: 1, record: { id: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(first.service.deliveries()[0]?.status).toBe('pending');
    first.service.close();
    // "Restart": a new service over the same database.
    const second = rig({ db, dir });
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(second.sent).toHaveLength(1);
    expect(second.service.deliveries()[0]?.status).toBe('success');
    second.service.close();
  });

  it('AC-LP-8 redeliver sends the same body again as a new delivery, and a test event can be sent', async () => {
    const r = rig();
    r.events.emit('products.created', { a: 1 });
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    const first = r.service.deliveries()[0];
    const again = r.service.redeliver(first?.id ?? '');
    expect(again?.id).not.toBe(first?.id);
    await vi.waitFor(() => expect(r.sent).toHaveLength(2));
    expect(JSON.parse(r.sent[1]?.body ?? '{}')).toEqual(JSON.parse(r.sent[0]?.body ?? '{}'));
    const definition = definitionOf([hook()]).webhooks[0];
    if (definition === undefined) throw new Error('missing');
    r.service.sendTest(definition);
    await vi.waitFor(() => expect(r.sent).toHaveLength(3));
    expect(r.sent[2]?.headers['x-tempo-event']).toBe('webhook.test');
    r.service.close();
  });

  it('AC-LP-8 test mode captures deliveries (deterministic ids, no delay) instead of sending them', async () => {
    const r = rig({ testMode: true, hooks: [hook({ delayMs: 5000 })] });
    r.events.emit('products.created', { collection: 'products', id: 1, record: { id: 1 } });
    await vi.waitFor(() => expect(r.service.captured()).toHaveLength(1));
    const [captured] = r.service.captured();
    expect(captured?.id).toBe('whd_000002');
    expect((captured?.json as { id: string }).id).toBe('evt_000001');
    expect(r.service.deliveries()[0]?.status).toBe('captured');
    expect(verifySignature(String(r.secrets.section('webhooks').orders), captured?.headers['x-tempo-signature'] ?? '', captured?.body ?? '')).toBe(true);
    r.service.reset();
    expect(r.service.captured()).toEqual([]);
    r.service.close();
  });
});

describe('webhook SSRF guard', () => {
  const team = { allowPrivate: false, requireHttps: true };

  it('AC-LP-8 refuses http, loopback, private and link-local addresses on a team server', () => {
    for (const url of ['http://example.com/h', 'https://localhost/h', 'https://127.0.0.1/h', 'https://10.0.0.5/h', 'https://192.168.1.2/h', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/h', 'https://[fd00::1]/h', 'https://user:pw@example.com/h', 'ftp://example.com/h']) {
      expect(() => checkOutboundUrl(url, team), url).toThrow(OutboundError);
    }
    expect(checkOutboundUrl('https://example.com/h', team).hostname).toBe('example.com');
  });

  it('AC-LP-8 allows localhost on a desktop or local web backend, and http on the team server only with the opt-out', () => {
    expect(checkOutboundUrl('http://localhost:8557/hook', { allowPrivate: true, requireHttps: false }).port).toBe('8557');
    expect(checkOutboundUrl('http://10.0.0.5/h', { allowPrivate: true, requireHttps: false }).hostname).toBe('10.0.0.5');
  });

  it('AC-LP-8 a delivery to a host that resolves to a private address is refused before any connection, and is not retried', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wh-'));
    const { httpTransport } = await import('../src/outbound.ts');
    const r = rig({ dir, transport: (request, policy) => httpTransport(request, { ...policy, resolve: () => Promise.resolve(['10.1.2.3']) }), policy: team, hooks: [hook({ url: 'https://hooks.example.com/x', retries: { max: 3 } })] });
    r.events.emit('products.created', {});
    await vi.waitFor(() => expect(r.service.deliveries()[0]?.status).toBe('failed'));
    const [delivery] = r.service.deliveries();
    expect(delivery?.attempts).toHaveLength(1);
    expect(delivery?.attempts[0]?.error).toMatch(/private network/);
    r.service.close();
  });

  it('AC-LP-8 a stored http address on a team server fails at send time with the reason', async () => {
    const r = rig({ policy: team, hooks: [hook({ url: 'http://example.com/x' })] });
    r.events.emit('products.created', {});
    await vi.waitFor(() => expect(r.service.deliveries()[0]?.status).toBe('failed'));
    expect(r.service.deliveries()[0]?.attempts[0]?.error).toMatch(/https/);
    expect(r.sent).toHaveLength(0);
    r.service.close();
  });
});

// ---- the whole engine, with a receiver on a real localhost port

interface Receiver {
  server: Server;
  url: string;
  received: { headers: IncomingHttpHeaders; body: string }[];
  status: { value: number };
}

async function receiver(): Promise<Receiver> {
  const received: Receiver['received'] = [];
  const status = { value: 200 };
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(status.value, { 'content-type': 'text/plain' });
      res.end('got it');
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${typeof address === 'object' && address !== null ? String(address.port) : '0'}/hook`, received, status };
}

const productsDefinition = (extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'hooks',
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }, { name: 'secret', type: 'string' }] }],
  endpoints: endpoints([{ id: 'post.products', type: 'crud', collection: 'products', action: 'create', method: 'POST', path: '/products', hiddenFields: ['secret'] }]),
  ...extra,
});

let receivers: Receiver[] = [];
beforeEach(() => {
  receivers = [];
});
afterEach(async () => {
  await Promise.all(receivers.map((r) => new Promise((done) => r.server.close(done))));
});

async function engine(extra: Partial<BackendInput> = {}) {
  const target = await receiver();
  receivers.push(target);
  const running = await serve(productsDefinition({ webhooks: [{ id: 'orders', url: target.url, events: ['products.created'], retries: { max: 1, backoff: 'exponential', baseMs: 50 } }], ...extra } as Partial<BackendInput>));
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = (title: string): Promise<Response> => fetch(`${running.url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, secret: 'hidden-value' }) });
  return { ...running, target, admin, create };
}

describe('webhooks in a running backend', () => {
  it('AC-LP-8 fires on a record create, hides the endpoint\'s hidden fields, and the signature verifies with the secret from the dashboard', async () => {
    const e = await engine();
    // The secret is made when the webhook is created through the admin API and shown once.
    const rotated = (await (await e.admin('/webhooks/orders/rotate-secret', 'POST')).json()) as { secret: string };
    await e.create('Lamp');
    await vi.waitFor(() => expect(e.target.received).toHaveLength(1));
    const got = e.target.received[0];
    expect(verifySignature(rotated.secret, String(got?.headers['x-tempo-signature']), got?.body ?? '')).toBe(true);
    const parsed = JSON.parse(got?.body ?? '{}') as { event: string; data: { record: Record<string, unknown> } };
    expect(parsed.event).toBe('products.created');
    expect(parsed.data.record.title).toBe('Lamp');
    expect(parsed.data.record).not.toHaveProperty('secret');
  });

  it('AC-LP-8 a failing receiver is retried, and redeliver sends again', async () => {
    const e = await engine();
    e.target.status.value = 500;
    await e.create('Lamp');
    await vi.waitFor(() => expect(e.target.received.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    await vi.waitFor(async () => {
      const list = (await (await e.admin('/webhook-deliveries')).json()) as { status: string; id: string }[];
      expect(list[0]?.status).toBe('failed');
    });
    e.target.status.value = 200;
    const list = (await (await e.admin('/webhook-deliveries')).json()) as { id: string }[];
    const before = e.target.received.length;
    const again = await e.admin(`/webhook-deliveries/${list[0]?.id ?? ''}/redeliver`, 'POST');
    expect(again.status).toBe(202);
    await vi.waitFor(() => expect(e.target.received.length).toBe(before + 1));
    const detail = (await (await e.admin(`/webhook-deliveries/${list[0]?.id ?? ''}`)).json()) as { attempts: { code: number; response: string }[]; body: string };
    expect(detail.attempts[0]?.code).toBe(500);
    expect(detail.attempts[0]?.response).toBe('got it');
    expect(detail.body).toContain('products.created');
  });

  it('AC-LP-8 CRUD: the secret is shown once at creation, rotating needs the admin role, and nothing reads it back', async () => {
    const e = await engine({ webhooks: [] });
    const made = await e.admin('/webhooks', 'POST', { id: 'late', url: e.target.url, events: ['products.*'] });
    expect(made.status).toBe(201);
    const body = (await made.json()) as { secret: string; webhook: Record<string, unknown> };
    expect(body.secret).toMatch(/^whsec_/);
    expect(JSON.stringify(body.webhook)).not.toContain(body.secret);
    expect(await (await e.admin('/webhooks/late')).text()).not.toContain(body.secret);
    expect(await (await e.admin('/webhooks')).text()).not.toContain(body.secret);
    expect(readFileSync(join(e.dir, 'backend.json'), 'utf8')).not.toContain(body.secret);
    expect((await e.admin('/webhooks', 'POST', { id: 'late', url: e.target.url, events: ['*'] })).status).toBe(409);
    expect((await e.admin('/webhooks', 'POST', { id: 'bad', url: 'nope', events: ['*'] })).status).toBe(400);
    const test = await e.admin('/webhooks/late/test', 'POST');
    expect(test.status).toBe(202);
    await vi.waitFor(() => expect(e.target.received).toHaveLength(1));
    expect(e.target.received[0]?.headers['x-tempo-event']).toBe('webhook.test');
    const rotated = (await (await e.admin('/webhooks/late/rotate-secret', 'POST')).json()) as { secret: string };
    expect(rotated.secret).not.toBe(body.secret);
    expect(verifySignature(body.secret, String(e.target.received[0]?.headers['x-tempo-signature']), e.target.received[0]?.body ?? '')).toBe(true);
    expect((await e.admin('/webhooks/late', 'DELETE')).status).toBe(200);
    expect((await e.admin('/webhooks/late')).status).toBe(404);
  });

  it('AC-LP-8 roles: editors manage webhooks, only admins rotate a secret, viewers read', () => {
    expect(ADMIN_ROLE_TABLE['POST /webhooks']).toBe('editor');
    expect(ADMIN_ROLE_TABLE['DELETE /webhooks/:id']).toBe('editor');
    expect(ADMIN_ROLE_TABLE['POST /webhooks/:id/rotate-secret']).toBe('admin');
    expect(ADMIN_ROLE_TABLE['GET /webhook-deliveries']).toBe('viewer');
    const actor = { kind: 'account', id: '1', label: 'a' } as const;
    expect(decide({ actor, role: 'editor' }, 'POST /webhooks/:id/rotate-secret').ok).toBe(false);
    expect(decide({ actor, role: 'admin' }, 'POST /webhooks/:id/rotate-secret').ok).toBe(true);
    expect(decide({ actor, role: 'viewer' }, 'POST /webhooks').ok).toBe(false);
  });

  it('AC-LP-8 the secret never appears in backend.json, the logs, the test snapshot, a request log entry or the audit summary', async () => {
    const e = await engine({ webhooks: [] });
    const made = (await (await e.admin('/webhooks', 'POST', { id: 'late', url: e.target.url, events: ['products.*'], headers: { 'x-api-key': 'receiver-token-123456' } })).json()) as { secret: string };
    await e.create('Lamp');
    await vi.waitFor(() => expect(e.target.received).toHaveLength(1));
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    const logs = files(join(e.dir, '.data', 'logs')).map((file) => readFileSync(file, 'utf8')).join('\n');
    const snapshot = JSON.stringify(buildTestSnapshot({ dir: e.dir, db: e.backend.engine.store.db, collections: ['products'] }));
    const requests = JSON.stringify(e.backend.engine.requests.snapshot());
    const audit = JSON.stringify(auditSummary((await (await e.admin('/webhooks/late')).json()) as unknown));
    const definition = readFileSync(join(e.dir, 'backend.json'), 'utf8');
    for (const [name, text] of Object.entries({ logs, snapshot, requests, audit, definition })) expect(text, name).not.toContain(made.secret);
    // The secret lives only in the secrets file.
    expect(readFileSync(join(e.dir, '.data', 'secrets.json'), 'utf8')).toContain(made.secret);
    expect(statSync(join(e.dir, '.data', 'secrets.json')).mode & 0o777).toBe(0o600);
  });
});

describe('webhook audit', () => {
  it('AC-LP-8 hides webhook header values in the audit copy of a body', async () => {
    const { webhookAuditBody } = await import('../src/admin-webhooks.ts');
    const audited = JSON.stringify(auditSummary(webhookAuditBody({ webhooks: [{ id: 'a', url: 'https://x.test', events: ['*'], headers: { 'x-api-key': 'receiver-token-123456' } }] })));
    expect(audited).not.toContain('receiver-token-123456');
    expect(audited).toContain('x-api-key');
  });
});

describe('webhook secrets are keyed by the webhook id only', () => {
  it('AC-LP-8 secretRef is not a field: a definition that sets it is refused', () => {
    expect(() => parseBackend({ name: 'x', webhooks: [{ id: 'a', url: 'https://x.test', events: ['*'], secretRef: 'b' }] })).toThrow(/secretRef|Unrecognized/);
  });

  it('AC-LP-8 creating or editing a webhook never returns or adopts another webhook\'s secret', async () => {
    const e = await engine({ webhooks: [] });
    const first = (await (await e.admin('/webhooks', 'POST', { id: 'first', url: e.target.url, events: ['*'] })).json()) as { secret: string };
    const sneaky = await e.admin('/webhooks', 'POST', { id: 'second', url: e.target.url, events: ['*'], secretRef: 'first' });
    expect(sneaky.status).toBe(400);
    expect(await sneaky.text()).not.toContain(first.secret);
    const second = (await (await e.admin('/webhooks', 'POST', { id: 'second', url: e.target.url, events: ['*'] })).json()) as { secret: string };
    expect(second.secret).not.toBe(first.secret);
    // The id of a webhook cannot be changed on PUT (that would adopt another webhook's secret).
    const rename = await e.admin('/webhooks/second', 'PUT', { id: 'first', url: e.target.url, events: ['*'] });
    expect(rename.status).toBe(400);
    expect(await rename.text()).not.toContain(first.secret);
    // Re-creating an id whose webhook was deleted gives a new secret, and deleting forgets only that webhook's.
    await e.admin('/webhooks/second', 'DELETE');
    const secrets = JSON.parse(readFileSync(join(e.dir, '.data', 'secrets.json'), 'utf8')) as { webhooks: Record<string, string> };
    expect(Object.keys(secrets.webhooks)).toEqual(['first']);
    const again = (await (await e.admin('/webhooks', 'POST', { id: 'second', url: e.target.url, events: ['*'] })).json()) as { secret: string };
    expect(again.secret).not.toBe(second.secret);
  });

  it('AC-LP-8 a delivery is signed with its own webhook\'s secret only', async () => {
    const r = rig({ hooks: [hook({ id: 'one' }), hook({ id: 'two' })] });
    r.events.emit('products.created', {});
    await vi.waitFor(() => expect(r.sent).toHaveLength(2));
    const secrets = r.secrets.section('webhooks') as Record<string, string>;
    expect(secrets.one).not.toBe(secrets.two);
    for (const call of r.sent) {
      const matching = Object.entries(secrets).filter(([, secret]) => verifySignature(secret, call.headers['x-tempo-signature'] ?? '', call.body));
      expect(matching).toHaveLength(1);
    }
    r.service.close();
  });
});

describe('webhook views hide what a viewer must not see', () => {
  it('AC-LP-8 the list and single reads hide header values and the address\'s userinfo and query values; an editor can open the full one', async () => {
    const e = await engine({ webhooks: [] });
    const target = new URL(e.target.url);
    const url = `http://${target.host}/hook?token=query-token-1&x=2`;
    expect((await e.admin('/webhooks', 'POST', { id: 'late', url, events: ['*'], headers: { 'x-api-key': 'receiver-token-123456' } })).status).toBe(201);
    for (const path of ['/webhooks', '/webhooks/late']) {
      const text = await (await e.admin(path)).text();
      expect(text, path).not.toContain('receiver-token-123456');
      expect(text, path).not.toContain('query-token-1');
      expect(text).toContain('x-api-key');
      expect(text).toContain('token=***');
    }
    const full = (await (await e.admin('/webhooks/late/full')).json()) as { url: string; headers: Record<string, string> };
    expect(full.url).toBe(url);
    expect(full.headers['x-api-key']).toBe('receiver-token-123456');
    const secrets = JSON.parse(readFileSync(join(e.dir, '.data', 'secrets.json'), 'utf8')) as { webhooks: Record<string, string> };
    expect(JSON.stringify(full)).not.toContain(secrets.webhooks.late ?? 'missing');
    const { ADMIN_ROLE_TABLE: table } = await import('../src/roles.ts');
    expect(table['GET /webhooks/:id/full']).toBe('editor');
    // The delivery log keeps the same safe form of the address.
    await e.admin('/webhooks/late/test', 'POST');
    await vi.waitFor(async () => expect(((await (await e.admin('/webhook-deliveries')).json()) as { url: string }[])[0]?.url).toBe(`http://${target.host}/hook?token=***&x=***`));
  });

  it('AC-LP-8 a delivery log address has no userinfo', async () => {
    const { safeUrl } = await import('../src/webhooks.ts');
    expect(safeUrl('https://user:pw@example.com/a/b?k=v#frag')).toBe('https://example.com/a/b?k=***');
    expect(safeUrl('not a url')).toBe('[invalid address]');
  });
});
