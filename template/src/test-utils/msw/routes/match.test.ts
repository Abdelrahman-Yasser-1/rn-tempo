import { matchPath, matchRoute, routes } from '.';

describe('matchPath', () => {
  test.each([
    ['/auth/login', '/auth/login', {}],
    ['/items/:id', '/items/42', { id: '42' }],
    ['/items/:id/reviews/:reviewId', '/items/1/reviews/a%20b', { id: '1', reviewId: 'a b' }],
    ['/auth/login/', '/auth/login', {}],
  ])('%s matches %s', (pattern, path, params) => {
    expect(matchPath(pattern, path)).toEqual(params);
  });

  test.each([
    ['/auth/login', '/auth/logout'],
    ['/items/:id', '/items'],
    ['/items/:id', '/items/1/extra'],
  ])('%s does not match %s', (pattern, path) => {
    expect(matchPath(pattern, path)).toBeNull();
  });
});

describe('matchRoute', () => {
  test('finds a route by method and path', () => {
    expect(matchRoute(routes, 'post', '/auth/login')?.route.path).toBe('/auth/login');
  });

  test('the method must match too', () => {
    expect(matchRoute(routes, 'get', '/auth/login')).toBeNull();
  });

  test('unknown paths do not match', () => {
    expect(matchRoute(routes, 'get', '/unknown')).toBeNull();
  });
});

describe('route table', () => {
  test('every route is unique by method and path', () => {
    const keys = routes.map((route) => `${route.method} ${route.path}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
