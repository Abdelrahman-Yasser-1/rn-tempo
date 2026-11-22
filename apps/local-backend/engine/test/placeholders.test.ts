import { afterEach, describe, expect, it } from 'vitest';

import { TEST_MODE_HEADER, TEST_MODE_NOW } from '../src/constants.ts';
import { Rng } from '../src/import/generate.ts';
import { fill, fillText, MAX_OUTPUT_CHARS, PlaceholderError, tokenize, type PlaceholderContext } from '../src/placeholders.ts';
import type { BackendInput } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

function context(extra: Partial<PlaceholderContext> = {}): PlaceholderContext {
  let counter = 0;
  const rng = new Rng('unit');
  return {
    params: { id: '7', name: 'Ada' },
    query: new URLSearchParams('q=shoes&page=2&empty='),
    headers: { 'x-request-id': 'req-1', authorization: 'Bearer secret', cookie: 'a=b', 'x-tempo-access-key': 'k', accept: 'application/json' },
    body: () => ({ name: 'Bo', n: 5, ok: true, nothing: null, user: { id: 3, tags: ['a', 'b'] }, list: [{ id: 9 }] }),
    user: { id: 42, username: 'emilys' },
    now: () => new Date('2025-06-01T12:00:00.000Z'),
    uuid: () => `00000000-0000-4000-a000-${String((counter += 1)).padStart(12, '0')}`,
    seq: () => 3,
    rng,
    ...extra,
  };
}
const one = (text: string, extra?: Partial<PlaceholderContext>): unknown => fill(text, context(extra));

describe('AC-LP-6 placeholders: every kind', () => {
  it('AC-LP-6 reads params, query, body (nested, arrays), headers and the signed-in user', () => {
    expect(one('{{params.id}}')).toBe('7');
    expect(one('{{query.q}}')).toBe('shoes');
    expect(one('{{body.name}}')).toBe('Bo');
    expect(one('{{body.user.id}}')).toBe(3);
    expect(one('{{body.user.tags.1}}')).toBe('b');
    expect(one('{{body.list.0.id}}')).toBe(9);
    expect(one('{{headers.x_request_id}}')).toBe('req-1');
    expect(one('{{headers.Accept}}')).toBe('application/json');
    expect(one('{{user.id}}')).toBe(42);
    expect(one('{{user.username}}')).toBe('emilys');
  });

  it('AC-LP-6 gives the clock, a uuid, the per-endpoint counter, random integers and fake data', () => {
    expect(one('{{now}}')).toBe('2025-06-01T12:00:00.000Z');
    expect(one('{{now.iso}}')).toBe('2025-06-01T12:00:00.000Z');
    expect(one('{{now.unix}}')).toBe(1_748_779_200);
    expect(one('{{uuid}}')).toMatch(/^[0-9a-f-]{36}$/);
    expect(one('{{seq}}')).toBe(3);
    const rolls = new Set(Array.from({ length: 50 }, () => one('{{random.int 1 6}}', { rng: new Rng(String(Math.random())) })));
    for (const roll of rolls) expect(roll).toSatisfy((value: number) => Number.isInteger(value) && value >= 1 && value <= 6);
    expect(one('{{random.int 10 1}}', { rng: new Rng('swap') })).toSatisfy((value: number) => value >= 1 && value <= 10);
    expect(one('{{fake.name}}')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(one('{{fake.email}}')).toMatch(/^[a-z]+\.[0-9a-f]{4}@example\.com$/);
    expect(one('{{fake.sentence}}')).toMatch(/^[A-Z][a-z ]+\.$/);
  });

  it('AC-LP-6 fills the extra roots (with, status, message, errors)', () => {
    expect(one('{{with.a.b}}', { vars: { with: { a: { b: 'deep' } } } })).toBe('deep');
    expect(one('{{status}} {{message}}', { vars: { status: 404, message: 'gone' } })).toBe('404 gone');
  });
});

describe('AC-LP-6 placeholders: the type rule', () => {
  it('AC-LP-6 a whole-string placeholder keeps the source type; one inside text is a string', () => {
    expect(one('{{body.n}}')).toBe(5);
    expect(one('{{body.ok}}')).toBe(true);
    expect(one('{{body.nothing}}')).toBeNull();
    expect(one('{{body.user}}')).toEqual({ id: 3, tags: ['a', 'b'] });
    expect(one('{{params.id}}')).toBe('7');
    expect(one('n={{body.n}}')).toBe('n=5');
    expect(one('{{body.n}}{{body.n}}')).toBe('55');
    expect(one('user: {{body.user}}')).toBe('user: {"id":3,"tags":["a","b"]}');
    expect(one('{{ body.n }}')).toBe(5);
  });

  it('AC-LP-6 the "| number" filter turns a number-like string into a number (and anything else into null)', () => {
    expect(one('{{params.id | number}}')).toBe(7);
    expect(one('{{query.page|number}}')).toBe(2);
    expect(one('{{params.name | number}}')).toBeNull();
    expect(one('{{query.empty | number}}')).toBeNull();
    expect(one('{{params.id | upper}}')).toBeNull();
  });

  it('AC-LP-6 fills arrays and objects deeply and leaves other values alone', () => {
    expect(fill({ a: ['{{params.id}}', 1, true, null], b: { c: 'x{{query.q}}' } }, context())).toEqual({ a: ['7', 1, true, null], b: { c: 'xshoes' } });
  });
});

describe('AC-LP-6 placeholders: missing values and bad tokens never crash', () => {
  it('AC-LP-6 a missing value is null on its own and empty inside text', () => {
    expect(one('{{params.nope}}')).toBeNull();
    expect(one('{{query.nope}}')).toBeNull();
    expect(one('{{body.user.nope.deeper}}')).toBeNull();
    expect(one('{{body.list.5.id}}')).toBeNull();
    expect(one('{{user.id}}', { user: undefined })).toBeNull();
    expect(one('a{{params.nope}}b')).toBe('ab');
    expect(one('{{body.n}}', { body: () => undefined })).toBeNull();
    expect(one('{{nothing.here}}')).toBeNull();
    expect(one('{{fake.nonsense}}')).toBeNull();
    expect(one('{{random.int abc}}')).toBeNull();
  });

  it('AC-LP-6 an unclosed or malformed token stays as text or becomes missing', () => {
    expect(one('open {{params.id')).toBe('open {{params.id');
    expect(one('{{}}')).toBeNull();
    expect(one('{{ params..id }}')).toBeNull();
    expect(one('{{params.id}')).toBe('{{params.id}');
  });

  it('AC-LP-6 never reads a private header', () => {
    for (const name of ['authorization', 'cookie', 'x_tempo_access_key', 'proxy_authorization', 'set_cookie']) expect(one(`{{headers.${name}}}`), name).toBeNull();
    expect(one('Bearer {{headers.authorization}}')).toBe('Bearer ');
  });
});

describe('AC-LP-6 placeholders: escapes', () => {
  it('AC-LP-6 \\{{ writes a literal {{', () => {
    expect(one('\\{{params.id}}')).toBe('{{params.id}}');
    expect(one('use \\{{uuid}} for ids, id={{params.id}}')).toBe('use {{uuid}} for ids, id=7');
    expect(tokenize('\\{{x}}')).toEqual(['{{x}}']);
    expect(fillText('\\{{params.id}}', context())).toBe('{{params.id}}');
  });
});

describe('AC-LP-6 placeholders: nothing is evaluated', () => {
  it('AC-LP-6 expressions, calls and template literals are not code: they are missing values or plain text', () => {
    for (const attack of ['{{constructor.constructor("return 1")()}}', '{{1+1}}', '{{params.id + 1}}', '{{`${7*7}`}}', '{{process.exit()}}', '{{require("fs")}}', '{{this}}', '{{globalThis}}']) {
      expect(one(attack), attack).toBeNull();
    }
    expect(one('${7*7}')).toBe('${7*7}');
    expect(one('`x`')).toBe('`x`');
    expect(one('{{params.id}} {{1+1}}')).toBe('7 ');
  });

  it('AC-LP-6 refuses __proto__, constructor and prototype segments, and never reads inherited properties', () => {
    for (const attack of ['{{body.__proto__}}', '{{body.constructor}}', '{{body.constructor.prototype}}', '{{params.constructor}}', '{{params.__proto__}}', '{{headers.__proto__}}', '{{body.user.__proto__.x}}', '{{body.toString}}', '{{body.hasOwnProperty}}', '{{with.constructor}}']) {
      expect(one(attack, { vars: { with: {} } }), attack).toBeNull();
    }
    // Array methods and length are not reachable either.
    expect(one('{{body.user.tags.length}}')).toBeNull();
    expect(one('{{body.user.tags.map}}')).toBeNull();
  });

  it('AC-LP-6 a request body with an own __proto__ key is copied as data and pollutes nothing', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "ok": 1}') as unknown;
    const out = fill({ echoed: '{{body}}' }, context({ body: () => hostile })) as { echoed: Record<string, unknown> };
    expect(Object.hasOwn(out.echoed, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(out.echoed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    // A template written with a __proto__ key stays a plain property too.
    const template = JSON.parse('{"__proto__": "{{params.id}}"}') as unknown;
    const filled = fill(template, context()) as Record<string, unknown>;
    expect(Object.getPrototypeOf(filled)).toBe(Object.prototype);
    expect(Object.hasOwn(filled, '__proto__')).toBe(true);
    expect(JSON.stringify(filled)).toBe('{"__proto__":"7"}');
  });
});

describe('AC-LP-6 placeholders: header values and the size cap', () => {
  it('AC-LP-6 strips line breaks from a header value (no header injection)', () => {
    const ctx = context({ query: new URLSearchParams([['q', 'a\r\nset-cookie: x=1']]) });
    expect(fillText('v={{query.q}}', ctx)).toBe('v=aset-cookie: x=1');
    expect(fillText('{{body.n}}-{{params.id}}', ctx)).toBe('5-7');
  });

  it('AC-LP-6 refuses a result bigger than the cap', () => {
    const big = 'x'.repeat(MAX_OUTPUT_CHARS / 2 + 10);
    const ctx = context({ body: () => ({ big }) });
    expect(() => fill({ a: '{{body.big}}', b: '{{body.big}}', c: '{{body.big}}' }, ctx)).toThrow(PlaceholderError);
    expect(() => fill('{{body.big}} {{body.big}}', ctx)).toThrow(PlaceholderError);
    expect(() => fill('x'.repeat(MAX_OUTPUT_CHARS + 1), context())).toThrow(PlaceholderError);
    expect(fill({ a: '{{body.big}}' }, ctx)).toEqual({ a: big });
  });

  it('AC-LP-6 refuses a template nested too deeply', () => {
    let deep: unknown = '{{params.id}}';
    for (let i = 0; i < 200; i += 1) deep = { a: deep };
    expect(() => fill(deep, context())).toThrow(PlaceholderError);
  });
});

const live = (extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'dynamic',
  auth: { seedUsers: [{ username: 'emilys', password: 'pw-emilys' }] },
  collections: [{ name: 'items', fields: [{ name: 'title', type: 'string' }], seed: [{ title: '{{uuid}} {{params.id}}' }] }],
  endpoints: [
    { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    {
      id: 'echo',
      type: 'static',
      method: 'POST',
      path: '/echo/:id',
      headers: { 'x-echo-id': '{{params.id}}' },
      body: { id: '{{params.id}}', numeric: '{{params.id | number}}', q: '{{query.q}}', who: '{{body.who}}', n: '{{body.n}}', agent: 'ua={{headers.x_agent}}', cookie: '{{headers.cookie}}', now: '{{now.iso}}', unix: '{{now.unix}}', uuid: '{{uuid}}', seq: '{{seq}}', seq2: '{{seq}}', roll: '{{random.int 1 100}}', name: '{{fake.name}}', literal: '\\{{params.id}}' },
      scenarios: { alt: { body: { alt: '{{params.id}}' }, headers: { 'x-alt': '{{query.q}}' } } },
    },
    { id: 'me', type: 'static', method: 'GET', path: '/me', auth: 'bearer', body: { id: '{{user.id}}', username: '{{user.username}}' } },
    { id: 'items.get', type: 'crud', collection: 'items', action: 'get', method: 'GET', path: '/items/:id' },
    { id: 'item', type: 'static', method: 'GET', path: '/item/:id', body: { template: 'card', with: { id: '{{params.id}}' } } },
  ],
  responseTemplates: { card: { body: { id: '{{with.id}}', stamp: '{{now.unix}}' } } },
  ...extra,
});

const echo = (url: string, headers: Record<string, string> = {}, path = '/echo/7?q=boots'): Promise<Response> =>
  fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ who: 'Bo', n: 5 }) });

describe('AC-LP-6 {{params.id}} and the rest take effect live', () => {
  it('AC-LP-6 echoes params, query, body and headers into a static body and headers, with the type rule', async () => {
    const { url } = await serve(live());
    const response = await echo(url, { 'x-agent': 'curl', cookie: 'a=b' });
    expect(response.headers.get('x-echo-id')).toBe('7');
    const body = await json(response);
    expect(body).toMatchObject({ id: '7', numeric: 7, q: 'boots', who: 'Bo', n: 5, agent: 'ua=curl', cookie: null, literal: '{{params.id}}' });
    expect(body.now).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(body.unix).toBeTypeOf('number');
    expect(body.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.roll).toSatisfy((value: number) => value >= 1 && value <= 100);
    expect(body.name).toMatch(/ /);
  });

  it('AC-LP-6 counts {{seq}} per endpoint, the same inside one answer, and gives a new uuid each time', async () => {
    const { url } = await serve(live());
    const first = await json(await echo(url));
    const second = await json(await echo(url));
    expect([first.seq, first.seq2, second.seq, second.seq2]).toEqual([1, 1, 2, 2]);
    expect(first.uuid).not.toBe(second.uuid);
  });

  it('AC-LP-6 fills scenario bodies and headers, and template bodies', async () => {
    const { url } = await serve(live());
    const scenario = await echo(url, { 'x-tempo-scenario': 'alt' });
    expect(scenario.headers.get('x-alt')).toBe('boots');
    expect(await json(scenario)).toEqual({ alt: '7' });
    const card = await json(await fetch(`${url}/item/12`));
    expect(card).toMatchObject({ id: '12' });
    expect(card.stamp).toBeTypeOf('number');
  });

  it('AC-LP-6 reads the signed-in user on a bearer endpoint', async () => {
    const { url } = await serve(live());
    const login = await json(await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'pw-emilys' }) }));
    const me = await json(await fetch(`${url}/me`, { headers: { authorization: `Bearer ${String(login.accessToken)}` } }));
    expect(me).toEqual({ id: expect.any(Number), username: 'emilys' });
  });

  it('AC-LP-6 does not fill the text of stored data (only the definition is a template)', async () => {
    const { url } = await serve(live());
    expect(await json(await fetch(`${url}/items/1`))).toMatchObject({ title: '{{uuid}} {{params.id}}' });
  });

  it('AC-LP-6 answers 500 with the reason when a filled response would be too large', async () => {
    const { url } = await serve(live({ endpoints: [{ id: 'amp', type: 'static', method: 'POST', path: '/amp', body: { a: '{{body.who}}', b: '{{body.who}}', c: '{{body.who}}' } }] }));
    // The request is under the 1 MB body limit; the answer would hold it three times.
    const response = await fetch(`${url}/amp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ who: 'x'.repeat(500_000) }) });
    expect(response.status).toBe(500);
    expect(String((await json(response)).detail)).toContain('larger than');
  });

  it('AC-LP-6 keeps prototype-pollution attempts in the request body out of the process', async () => {
    const { url } = await serve(live({ endpoints: [{ id: 'echo', type: 'static', method: 'POST', path: '/e', body: { got: '{{body}}', peek: '{{body.__proto__.polluted}}' } }] }));
    const response = await fetch(`${url}/e`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}' });
    expect(response.status).toBe(200);
    expect((await json(response)).peek).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('AC-LP-6 placeholders in test mode', () => {
  const sequence = async (): Promise<unknown[]> => {
    const { url } = await serve(live(), { testMode: true });
    const out: unknown[] = [];
    for (let i = 0; i < 3; i += 1) {
      const body = await json(await echo(url));
      out.push([body.now, body.unix, body.uuid, body.roll, body.name, body.seq]);
    }
    return out;
  };

  it('AC-LP-6 uses a fixed clock and seeded uuid, random and fake values, the same on every run', async () => {
    const first = await sequence();
    expect(await sequence()).toEqual(first);
    const [[now, unix, , , , seq]] = first as [[string, number, string, number, string, number]];
    expect(now).toBe(TEST_MODE_NOW);
    expect(unix).toBe(Date.parse(TEST_MODE_NOW) / 1000);
    expect(seq).toBe(1);
    expect(new Set((first as unknown[][]).map((row) => row[2])).size).toBe(3);
  });

  it('AC-LP-6 also works for one request with the test-mode header, and {{seq}} starts again after resetSequences', async () => {
    const { url, backend } = await serve(live());
    const header = { [TEST_MODE_HEADER]: '1' };
    const a = await json(await echo(url, header));
    expect(a.now).toBe(TEST_MODE_NOW);
    expect(a.seq).toBe(1);
    expect((await json(await echo(url, header))).seq).toBe(2);
    backend.engine.resetSequences();
    const again = await json(await echo(url, header));
    expect(again.seq).toBe(1);
    // After a reset the same endpoint number gives the same uuid and roll as the very first answer.
    expect(again.uuid).toBe(a.uuid);
    expect(again.roll).toBe(a.roll);
    // Outside test mode the clock is real.
    expect((await json(await echo(url))).now).not.toBe(TEST_MODE_NOW);
  });
});
