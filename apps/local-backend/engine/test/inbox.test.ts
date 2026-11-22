import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { Inbox, curlOf, maskHeaders, maskQuery, maskTail } from '../src/inbox.ts';
import { ADMIN_ROLE_TABLE } from '../src/roles.ts';
import type { BackendInput } from '../src/schema.ts';
import type { Transport } from '../src/outbound.ts';

import { serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const definition = (inbox: Record<string, unknown> = {}): BackendInput => ({
  name: 'inbox',
  endpoints: [{ id: 'any.inbox.stripe', type: 'inbox', path: '/inbox/stripe', ...inbox } as never],
});

async function start(inbox: Record<string, unknown> = {}, options: Parameters<typeof serve>[1] = {}) {
  const running = await serve(definition(inbox), options);
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ...running, admin };
}

describe('inbox capture', () => {
  it('AC-LP-8 captures any method, headers and body, and answers { received: true } by default', async () => {
    const { url, admin } = await start();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'GET']) {
      const answer = await fetch(`${url}/inbox/stripe?x=1`, { method, headers: { 'content-type': 'application/json', 'x-custom': 'yes' }, ...(method === 'GET' ? {} : { body: JSON.stringify({ n: method }) }) });
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ received: true });
    }
    const list = (await (await admin('/inbox')).json()) as { entries: { id: number; method: string; size: number; query: string }[]; count: number };
    expect(list.entries.map((entry) => entry.method)).toEqual(['GET', 'DELETE', 'PATCH', 'PUT', 'POST']);
    const detail = (await (await admin(`/inbox/${String(list.entries[4]?.id)}`)).json()) as { body: string; headers: Record<string, string>; curl: string; query: string };
    expect(JSON.parse(detail.body)).toEqual({ n: 'POST' });
    expect(detail.headers['x-custom']).toBe('yes');
    expect(detail.query).toBe('x=1');
    expect(detail.curl).toContain("-X POST 'https://localhost:");
    expect(detail.curl).toContain('/inbox/stripe?x=1');
  });

  it('AC-LP-8 the configured status and body are answered', async () => {
    const { url } = await start({ status: 202, body: { ok: 'queued' } });
    const answer = await fetch(`${url}/inbox/stripe`, { method: 'POST', body: 'hello' });
    expect(answer.status).toBe(202);
    expect(await answer.json()).toEqual({ ok: 'queued' });
  });

  it('AC-LP-8 keeps raw bytes (binary round-trips as base64) and answers 413 above 1 MB', async () => {
    const { url, admin } = await start();
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
    await fetch(`${url}/inbox/stripe`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
    const entries = ((await (await admin('/inbox')).json()) as { entries: { id: number }[] }).entries;
    const detail = (await (await admin(`/inbox/${String(entries[0]?.id)}`)).json()) as { encoding: string; body: string };
    expect(detail.encoding).toBe('base64');
    expect(Buffer.from(detail.body, 'base64').equals(bytes)).toBe(true);
    const over = await fetch(`${url}/inbox/stripe`, { method: 'POST', body: Buffer.alloc(1_048_577, 97) });
    expect(over.status).toBe(413);
    const exact = await fetch(`${url}/inbox/stripe`, { method: 'POST', body: Buffer.alloc(1_048_576, 97) });
    expect(exact.status).toBe(200);
    expect(((await (await admin('/inbox')).json()) as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('AC-LP-8 masks credentials and signature headers, and the request log shows only the length of the body', async () => {
    const { url, admin, backend } = await start();
    await fetch(`${url}/inbox/stripe`, {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-token', cookie: 'sid=abc', 'stripe-signature': 't=1,v1=0123456789abcdef', 'content-type': 'application/json' },
      body: JSON.stringify({ card: '4242424242424242' }),
    });
    const entries = ((await (await admin('/inbox')).json()) as { entries: { id: number }[] }).entries;
    const detail = (await (await admin(`/inbox/${String(entries[0]?.id)}`)).json()) as { headers: Record<string, string> };
    const headers = detail.headers;
    expect(headers.authorization).toBe('[REDACTED]');
    expect(headers.cookie).toBe('[REDACTED]');
    expect(headers['stripe-signature']).toBe('****cdef');
    expect(JSON.stringify(detail)).not.toContain('super-secret-token');
    const log = JSON.stringify(backend.engine.requests.snapshot());
    expect(log).not.toContain('4242424242424242');
    expect(log).toMatch(/\d+ bytes captured/);
  });

  it('AC-LP-8 the list never carries bodies, and the detail route needs the editor role', () => {
    expect(ADMIN_ROLE_TABLE['GET /inbox']).toBe('viewer');
    expect(ADMIN_ROLE_TABLE['GET /inbox/:id']).toBe('editor');
    expect(ADMIN_ROLE_TABLE['DELETE /inbox']).toBe('editor');
    expect(ADMIN_ROLE_TABLE['POST /inbox/:id/replay']).toBe('editor');
  });

  it('AC-LP-8 clear empties the inbox', async () => {
    const { url, admin } = await start();
    await fetch(`${url}/inbox/stripe`, { method: 'POST', body: 'a' });
    expect(((await (await admin('/inbox', 'DELETE')).json()) as { deleted: number }).deleted).toBe(1);
    expect(((await (await admin('/inbox')).json()) as { entries: unknown[] }).entries).toEqual([]);
  });
});

describe('inbox privacy', () => {
  it('AC-LP-8 every credential-looking header form is hidden, signatures keep four characters, the rest is kept', () => {
    const masked = maskHeaders({
      authorization: 'Bearer a1', 'proxy-authorization': 'Basic b2', 'x-api-key': 'k3', 'x-auth-token': 't4', 'x-session-id': 's5', cookie: 'c6', 'set-cookie': 'c7',
      'x-access-token': 't8', 'x-client-secret': 'z9', 'x-credentials': 'c0', 'x-password': 'p1', 'idempotency-key': 'i2', 'x-amz-security-token': 'a3',
      'x-hub-signature-256': 'sha256=0123456789', 'stripe-signature': 't=1,v1=abcd1234',
      'content-type': 'application/json', 'user-agent': 'node', 'x-request-id': 'req-1',
    });
    for (const name of ['authorization', 'proxy-authorization', 'x-api-key', 'x-auth-token', 'x-session-id', 'cookie', 'set-cookie', 'x-access-token', 'x-client-secret', 'x-credentials', 'x-password', 'idempotency-key', 'x-amz-security-token']) expect(masked[name], name).toBe('[REDACTED]');
    expect(masked['x-hub-signature-256']).toBe('****6789');
    expect(masked['stripe-signature']).toBe('****1234');
    expect(masked['content-type']).toBe('application/json');
    expect(masked['x-request-id']).toBe('req-1');
  });

  it('AC-LP-8 credential query parameters are redacted before storing, the others kept', () => {
    expect(maskQuery('token=abc&page=2&api_key=k&sig=1&code=9&session=s&x=a%20b')).toBe(`token=[REDACTED]&page=2&api_key=[REDACTED]&sig=1&code=[REDACTED]&session=[REDACTED]&x=a%20b`);
    expect(maskQuery('')).toBe('');
  });

  it('AC-LP-8 the list shows method, path, time, size and status only; the query is stored redacted; the detail masks credentials', async () => {
    const { url, admin } = await start();
    await fetch(`${url}/inbox/stripe?token=live-token-1&n=1`, { method: 'POST', headers: { 'x-api-key': 'key-value-1', 'x-session-id': 'sess-1', 'x-trace': 't' }, body: 'hello' });
    const listText = await (await admin('/inbox')).text();
    const list = JSON.parse(listText) as { entries: Record<string, unknown>[] };
    expect(Object.keys(list.entries[0] ?? {}).sort()).toEqual(['at', 'endpointId', 'id', 'method', 'path', 'size', 'status']);
    expect(list.entries[0]).toMatchObject({ method: 'POST', path: '/inbox/stripe', size: 5, status: 200 });
    for (const secret of ['live-token-1', 'key-value-1', 'sess-1', 'hello']) expect(listText).not.toContain(secret);
    const detailText = await (await admin(`/inbox/${String(list.entries[0]?.id)}`)).text();
    for (const secret of ['live-token-1', 'key-value-1', 'sess-1']) expect(detailText, secret).not.toContain(secret);
    expect(detailText).toContain('n=1');
    expect(detailText).toContain('x-trace');
  });
});

describe('inbox storage', () => {
  it('AC-LP-8 keeps the last N per endpoint (a ring) and does not touch another endpoint', () => {
    const inbox = new Inbox(new DatabaseSync(':memory:'), () => new Date('2025-01-01T00:00:00Z'));
    const put = (endpointId: string, n: number): void => void inbox.capture({ endpointId, method: 'POST', path: '/x', query: '', headers: {}, body: Buffer.from(String(n)), keep: 3, status: 200 });
    for (let n = 0; n < 5; n += 1) put('a', n);
    put('b', 0);
    expect(inbox.list('a').map((entry) => inbox.get(entry.id)?.body)).toEqual(['4', '3', '2']);
    expect(inbox.list('b')).toHaveLength(1);
  });

  it('AC-LP-8 masks the tail of a signature and leaves short values fully masked', () => {
    expect(maskTail('abcdefgh')).toBe('****efgh');
    expect(maskTail('abc')).toBe('****');
    expect(maskHeaders({ 'x-hub-signature-256': 'sha256=deadbeef', 'x-keep': 'v', authorization: 'x' })).toEqual({ 'x-hub-signature-256': '****beef', 'x-keep': 'v', authorization: '[REDACTED]' });
  });

  it('AC-LP-8 a curl command repeats the request without credentials', () => {
    const entry = { id: 1, endpointId: 'e', at: '', method: 'POST', path: '/p', query: '', headers: { 'content-type': 'text/plain', authorization: '[REDACTED]', 'x-sig-signature': '****1234', host: 'h' }, size: 3, status: 200, body: "it's", encoding: 'utf8' as const };
    const curl = curlOf(entry, 'http://localhost:1/p');
    expect(curl).toBe("curl -X POST 'http://localhost:1/p' -H 'content-type: text/plain' --data-raw 'it'\\''s'");
  });
});

describe('inbox replay', () => {
  let target: Server | undefined;
  afterEach(() => void target?.close());

  it('AC-LP-8 replays a captured request to a URL and reports the answer', async () => {
    const seen: { method: string | undefined; body: string; type: string | undefined; auth: string | undefined }[] = [];
    target = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      req.on('end', () => {
        seen.push({ method: req.method, body, type: req.headers['content-type'], auth: req.headers.authorization });
        res.writeHead(201);
        res.end('replayed');
      });
    });
    await new Promise<void>((done) => target?.listen(0, '127.0.0.1', done));
    const address = target.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const { url, admin } = await start();
    await fetch(`${url}/inbox/stripe`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abc' }, body: '{"a":1}' });
    const id = ((await (await admin('/inbox')).json()) as { entries: { id: number }[] }).entries[0]?.id;
    const answer = await admin(`/inbox/${String(id)}/replay`, 'POST', { url: `http://127.0.0.1:${String(port)}/x` });
    expect(await answer.json()).toEqual({ status: 201, body: 'replayed' });
    expect(seen).toEqual([{ method: 'POST', body: '{"a":1}', type: 'application/json', auth: undefined }]);
  });

  it('AC-LP-8 a replay goes through the SSRF guard on a team server', async () => {
    const calls: string[] = [];
    const transport: Transport = (request) => {
      calls.push(request.url);
      return Promise.resolve({ status: 200, body: '' });
    };
    const { url, admin } = await start({}, { importUrls: { allowPrivate: false }, webhookTransport: transport });
    await fetch(`${url}/inbox/stripe`, { method: 'POST', body: 'x' });
    const id = ((await (await admin('/inbox')).json()) as { entries: { id: number }[] }).entries[0]?.id;
    for (const target of ['http://example.com/x', 'https://127.0.0.1/x', 'https://169.254.169.254/x', 'https://10.0.0.1/x']) {
      const answer = await admin(`/inbox/${String(id)}/replay`, 'POST', { url: target });
      expect(answer.status, target).toBe(400);
    }
    expect(calls).toEqual([]);
    const ok = await admin(`/inbox/${String(id)}/replay`, 'POST', { url: 'https://example.com/x' });
    expect(ok.status).toBe(200);
    expect(calls).toEqual(['https://example.com/x']);
  });

  it('AC-LP-8 an inbox answers within the engine\'s latency (Z4) and backend.json keeps no captured data', async () => {
    const { url, dir } = await start({ latency: { fixedMs: 30 } });
    const began = Date.now();
    await fetch(`${url}/inbox/stripe`, { method: 'POST', body: 'payload-xyz' });
    expect(Date.now() - began).toBeGreaterThanOrEqual(25);
    expect(readFileSync(join(dir, 'backend.json'), 'utf8')).not.toContain('payload-xyz');
  });
});
