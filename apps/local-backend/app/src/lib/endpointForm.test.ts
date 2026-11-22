import { describe, expect, it } from 'vitest';

import type { CollectionDef, EndpointDef } from '../api/types';

import { blankForm, changeType, endpointFrom, formFrom, newId, problemsOf, suggest } from './endpointForm';

const collections: CollectionDef[] = [{ name: 'products', fields: [{ name: 'title', type: 'string' }] }];

describe('endpoint form', () => {
  it('suggests the method and path from the type and action', () => {
    const list = blankForm('crud', collections);
    expect([list.method, list.path]).toEqual(['GET', '/products']);
    expect(suggest({ ...list, crudAction: 'get' }, true)).toMatchObject({ method: 'GET', path: '/products/:id' });
    expect(suggest({ ...list, crudAction: 'create' }, true)).toMatchObject({ method: 'POST', path: '/products' });
    expect(suggest({ ...list, crudAction: 'delete' }, true)).toMatchObject({ method: 'DELETE', path: '/products/:id' });
    // PATCH stays PATCH for an update; a path the user typed is kept unless forced.
    expect(suggest({ ...list, crudAction: 'update', method: 'PATCH', path: '/items/:id' })).toMatchObject({ method: 'PATCH', path: '/items/:id' });
    expect(blankForm('auth', collections)).toMatchObject({ method: 'POST', path: '/auth/login', auth: 'none' });
    expect(changeType(list, 'users', collections)).toMatchObject({ type: 'users', action: 'add', method: 'POST', path: '/users/add' });
    expect(changeType(list, 'download', collections)).toMatchObject({ method: 'GET', path: '/media/:id' });
  });

  it('switching the type drops what belongs to the old type', () => {
    const crud: EndpointDef = { id: 'a', type: 'crud', method: 'GET', path: '/products', collection: 'products', action: 'list', hiddenFields: ['title'], aliases: ['/p'], scenarios: { slow: { delayMs: 5 } } };
    const asStatic = endpointFrom({ ...changeType(formFrom(crud, collections), 'static', collections), path: '/ping' }, 'a', crud);
    expect(asStatic).toEqual({ id: 'a', type: 'static', method: 'GET', path: '/ping', auth: 'none', status: 200, body: { ok: true }, aliases: ['/p'], scenarios: { slow: { delayMs: 5 } } });
    expect(asStatic).not.toHaveProperty('collection');
    expect(asStatic).not.toHaveProperty('hiddenFields');
  });

  it('editing keeps what the form does not show', () => {
    const crud: EndpointDef = { id: 'a', type: 'crud', method: 'GET', path: '/products', collection: 'products', action: 'list', hiddenFields: ['title'], defaultLimit: 30, aliases: ['/p'] };
    const form = { ...formFrom(crud, collections), summary: 'All products', searchFields: ['title'] };
    expect(endpointFrom(form, 'a', crud)).toEqual({ ...crud, summary: 'All products', auth: 'none', listShape: 'dummyjson', searchFields: ['title'] });
  });

  it('builds each type from its form', () => {
    expect(endpointFrom({ ...blankForm('upload', collections), maxMb: '5', multiple: true }, 'u')).toMatchObject({ type: 'upload', maxBytes: 5 * 1024 * 1024, multiple: true, method: 'POST' });
    expect(endpointFrom({ ...blankForm('handler', collections), path: '/hello', timeoutMs: '1000' }, 'h')).toMatchObject({ type: 'handler', file: 'handlers/hello.js', timeoutMs: 1000 });
    expect(endpointFrom({ ...blankForm('static', collections), path: '/x', status: '404', body: '{"a":1}' }, 's')).toMatchObject({ status: 404, body: { a: 1 } });
    expect(endpointFrom({ ...blankForm('crud', collections), ownerField: 'owner', auth: 'bearer' }, 'c')).toMatchObject({ ownerField: 'owner', auth: 'bearer' });
  });

  it('reads a fixed answer back into the form', () => {
    const endpoint: EndpointDef = { id: 's', type: 'static', method: 'GET', path: '/app-config', status: 201, body: { a: [1] } };
    expect(formFrom(endpoint, collections)).toMatchObject({ type: 'static', status: '201', body: '{\n  "a": [\n    1\n  ]\n}' });
  });

  it('finds the problems it can without asking the engine', () => {
    const bad = { ...blankForm('static', collections), path: 'no-slash', status: '999', body: '{oops' };
    expect(problemsOf(bad).map((p) => p.field)).toEqual(['path', 'status', 'body']);
    expect(problemsOf({ ...blankForm('crud', []), path: '/x' }).map((p) => p.field)).toEqual(['collection']);
    expect(problemsOf({ ...blankForm('handler', collections), path: '/h', file: '../x.js' }).map((p) => p.field)).toEqual(['file']);
    expect(problemsOf(blankForm('crud', collections))).toEqual([]);
  });

  it('makes a unique id', () => {
    expect(newId('GET', '/products/:id', new Set())).toBe('get.products.:id');
    expect(newId('GET', '/', new Set())).toBe('get.root');
    expect(newId('GET', '/a', new Set(['get.a', 'get.a.2']))).toBe('get.a.3');
  });
});

describe('live events (SSE) form', () => {
  it('AC-LP-7 starts with GET /events, a sample script, and builds the endpoint from the text fields', () => {
    const form = blankForm('sse', collections);
    expect(form).toMatchObject({ method: 'GET', path: '/events', retryMs: '3000', heartbeatMs: '15000' });
    const made = endpointFrom({ ...form, on: 'products.created, products.*\norders.shipped', script: '[{"data":"hi","repeat":2}]' }, 'get.events');
    expect(made).toEqual({
      id: 'get.events',
      type: 'sse',
      method: 'GET',
      path: '/events',
      auth: 'none',
      script: [{ data: 'hi', repeat: 2 }],
      on: ['products.created', 'products.*', 'orders.shipped'],
      retryMs: 3000,
      heartbeatMs: 15_000,
    });
  });

  it('AC-LP-7 reads an endpoint back into text fields and keeps the limits the form does not show', () => {
    const endpoint: EndpointDef = { id: 'a', type: 'sse', method: 'GET', path: '/live', script: [{ event: 'x', data: 1 }], on: ['a.b'], retryMs: 500, heartbeatMs: 0, maxConnections: 7 };
    const form = formFrom(endpoint, collections);
    expect(form).toMatchObject({ on: 'a.b', retryMs: '500', heartbeatMs: '0' });
    expect(JSON.parse(form.script)).toEqual([{ event: 'x', data: 1 }]);
    expect(endpointFrom(form, 'a', endpoint)).toMatchObject({ maxConnections: 7, on: ['a.b'] });
  });

  it('AC-LP-7 names what is wrong with the script, the events and the numbers', () => {
    const form = { ...blankForm('sse', collections), script: '{"not":"a list"}', on: 'bad name!', retryMs: 'x', heartbeatMs: '-1' };
    expect(problemsOf(form).map((problem) => problem.field).sort()).toEqual(['heartbeatMs', 'on', 'retryMs', 'script']);
    expect(problemsOf({ ...form, script: 'nope' }).find((problem) => problem.field === 'script')?.message).toBe('The script is not valid JSON.');
    expect(problemsOf(blankForm('sse', collections))).toEqual([]);
  });
});

describe('live socket (WebSocket) form', () => {
  it('AC-LP-7 starts with GET /ws and echo, and builds rules, a welcome message and the limits', () => {
    const form = blankForm('websocket', collections);
    expect(form).toMatchObject({ method: 'GET', path: '/ws', behavior: 'echo', maxPayloadKb: '64' });
    const echo = endpointFrom(form, 'get.ws');
    expect(echo).toEqual({ id: 'get.ws', type: 'websocket', method: 'GET', path: '/ws', auth: 'none', behavior: 'echo', rules: [], on: [], subprotocols: [], maxPayloadBytes: 65_536 });
    const rules = endpointFrom({ ...form, behavior: 'rules', rules: '[{"match":{"type":"ping"},"reply":"pong"}]', onConnect: '"hi"', on: 'a.b', subprotocols: 'chat.v1, chat.v2', maxPayloadKb: '1' }, 'get.ws');
    expect(rules).toMatchObject({ behavior: 'rules', rules: [{ match: { type: 'ping' }, reply: 'pong' }], onConnect: 'hi', on: ['a.b'], subprotocols: ['chat.v1', 'chat.v2'], maxPayloadBytes: 1024 });
  });

  it('AC-LP-7 reads an endpoint back and names what is wrong', () => {
    const endpoint: EndpointDef = { id: 'a', type: 'websocket', method: 'GET', path: '/chat', behavior: 'rules', rules: [{ match: { contains: 'x' }, reply: 'y' }], onConnect: { hi: 1 }, subprotocols: ['chat'], maxPayloadBytes: 2048, pingIntervalMs: 99 };
    const form = formFrom(endpoint, collections);
    expect(form).toMatchObject({ behavior: 'rules', subprotocols: 'chat', maxPayloadKb: '2' });
    expect(JSON.parse(form.onConnect)).toEqual({ hi: 1 });
    expect(endpointFrom(form, 'a', endpoint)).toMatchObject({ pingIntervalMs: 99, maxPayloadBytes: 2048 });
    const bad = { ...form, rules: '{}', onConnect: 'not json', maxPayloadKb: '0', on: 'bad!' };
    expect(problemsOf(bad).map((problem) => problem.field).sort()).toEqual(['maxPayloadKb', 'on', 'onConnect', 'rules']);
    // The rules are only checked when they are used.
    expect(problemsOf({ ...bad, behavior: 'echo' }).some((problem) => problem.field === 'rules')).toBe(false);
  });
});
