import { SKIP_REFRESH_PATHS, shouldSkipRefresh, toRequestPath } from './skipRefresh';

describe('toRequestPath', () => {
  test.each([
    ['/auth/login', undefined, '/auth/login'],
    ['/auth/login?x=1#top', undefined, '/auth/login'],
    ['auth/login', undefined, '/auth/login'],
    ['https://api.test/v1/auth/login', 'https://api.test/v1', '/auth/login'],
    ['https://api.test/auth/login?a=b', undefined, '/auth/login'],
    ['/v1/auth/login', '/v1/', '/auth/login'],
  ])('%s with base %s becomes %s', (url, base, expected) => {
    expect(toRequestPath(url, base)).toBe(expected);
  });
});

describe('shouldSkipRefresh', () => {
  test.each(SKIP_REFRESH_PATHS)('skips %s', (url) => {
    expect(shouldSkipRefresh({ url })).toBe(true);
  });

  test.each(['/auth/login-history', '/auth/login/extra', '/items', '/auth/me'])(
    'does not skip %s',
    (url) => {
      expect(shouldSkipRefresh({ url })).toBe(false);
    },
  );

  test('skipAuthRefresh wins over the path', () => {
    expect(shouldSkipRefresh({ url: '/items', skipAuthRefresh: true })).toBe(true);
  });

  test('a request without a URL is not skipped', () => {
    expect(shouldSkipRefresh({})).toBe(false);
  });

  test('accepts a custom list', () => {
    expect(shouldSkipRefresh({ url: '/x' }, ['/x'])).toBe(true);
  });
});
