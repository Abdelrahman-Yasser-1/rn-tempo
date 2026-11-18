import { describe, expect, it } from 'vitest';

import type { EndpointSummary } from '../client/types';

import { accessTokenFrom, buildTryRequest, fillPath, findLoginEndpoint, groupEndpoints, matchesQuery, pathParams, prettyBody } from './endpoints';

const endpoint = (overrides: Partial<EndpointSummary>): EndpointSummary => ({
  id: 'get.x',
  method: 'GET',
  path: '/x',
  auth: null,
  summary: null,
  tags: [],
  scenarios: ['notFound'],
  ...overrides,
});

const LIST = [
  endpoint({ id: 'get.products', path: '/products', tags: ['products'], summary: 'List products' }),
  endpoint({ id: 'get.products.:id', path: '/products/:id', tags: ['products'] }),
  endpoint({ id: 'post.auth.login', method: 'POST', path: '/auth/login', tags: ['auth'] }),
  endpoint({ id: 'get.misc', path: '/misc' }),
];

describe('groupEndpoints', () => {
  it('groups by first tag, alphabetical, untagged last', () => {
    expect(groupEndpoints(LIST, '').map((group) => [group.tag, group.items.length])).toEqual([
      ['auth', 1],
      ['products', 2],
      ['untagged', 1],
    ]);
  });

  it('filters on every word, in any field', () => {
    expect(groupEndpoints(LIST, 'post login').flatMap((group) => group.items.map((item) => item.id))).toEqual(['post.auth.login']);
    expect(groupEndpoints(LIST, 'LIST prod')).toHaveLength(1);
    expect(groupEndpoints(LIST, 'nothing-like-this')).toEqual([]);
  });

  it('matches everything for an empty query', () => {
    expect(matchesQuery(LIST[0] as EndpointSummary, '   ')).toBe(true);
  });
});

describe('paths', () => {
  it('finds and fills path parameters, encoding values', () => {
    expect(pathParams('/users/:userId/posts/:id')).toEqual(['userId', 'id']);
    expect(fillPath('/users/:userId/posts/:id', { userId: 'a b', id: '7' })).toBe('/users/a%20b/posts/7');
  });

  it('leaves a missing parameter visible', () => {
    expect(fillPath('/products/:id', {})).toBe('/products/:id');
  });
});

describe('buildTryRequest', () => {
  const base = { endpoint: { method: 'POST', path: '/products/:id' }, params: { id: '3' }, query: '?a=1', body: '{"x":1}', token: ' tok ' };

  it('builds the request with the token and a JSON body', () => {
    const built = buildTryRequest(base);
    expect(built).toEqual({
      request: {
        method: 'POST',
        path: '/products/3?a=1',
        headers: [['accept', 'application/json'], ['authorization', 'Bearer tok'], ['content-type', 'application/json']],
        body: '{"x":1}',
      },
    });
  });

  it('sends no body for GET and no token header when empty', () => {
    const built = buildTryRequest({ ...base, endpoint: { method: 'GET', path: '/p' }, token: '', query: '' });
    expect(built).toEqual({ request: { method: 'GET', path: '/p', headers: [['accept', 'application/json']], body: null } });
  });

  it('refuses a body that is not JSON', () => {
    expect(buildTryRequest({ ...base, body: '{oops' })).toEqual({ error: 'The body is not valid JSON.' });
  });

  it('refuses a method that cannot be sent', () => {
    expect('error' in buildTryRequest({ ...base, endpoint: { method: 'TRACE', path: '/' } })).toBe(true);
  });

  it('can pick a scenario for one request', () => {
    const built = buildTryRequest({ ...base, scenario: 'notFound' });
    expect('request' in built && built.request.headers?.some(([name, value]) => name === 'x-tempo-scenario' && value === 'notFound')).toBe(true);
  });
});

describe('helpers', () => {
  it('indents JSON and leaves other text alone', () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyBody('<html>')).toBe('<html>');
    expect(prettyBody('')).toBe('');
  });

  it('finds the login endpoint and reads the token', () => {
    expect(findLoginEndpoint(LIST)?.id).toBe('post.auth.login');
    expect(accessTokenFrom('{"accessToken":"abc"}')).toBe('abc');
    expect(accessTokenFrom('{"accessToken":1}')).toBeNull();
    expect(accessTokenFrom('nope')).toBeNull();
  });
});
