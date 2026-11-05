import { isSensitiveEndpoint, sensitiveEndpointPatterns } from './sensitiveEndpoints';

describe('isSensitiveEndpoint', () => {
  test.each([
    '/auth/login',
    '/auth/login?next=%2Fhome',
    '/auth/refresh',
    '/auth/me',
    '/users/add',
    '/users/12',
    'https://api.test/users/12?x=1',
    '//auth//login',
    '/users/add/',
    '/AUTH/login?x=1',
    '/auth/new-endpoint',
    '/auth/login-history',
    '/Users/Add',
  ])('flags %s', (url) => {
    expect(isSensitiveEndpoint(url)).toBe(true);
  });

  test.each(['/products', '/products/add', '/users', '/users/12/posts'])(
    'does not flag %s',
    (url) => {
      expect(isSensitiveEndpoint(url)).toBe(false);
    },
  );

  test('strips the base URL before matching', () => {
    expect(isSensitiveEndpoint('https://api.test/v1/users/add', 'https://api.test/v1')).toBe(true);
  });
});

describe('sensitiveEndpointPatterns', () => {
  const matches = (line: string) =>
    sensitiveEndpointPatterns().some((pattern) => pattern.test(line));

  test.each([
    'POST https://api.test/auth/login',
    'POST https://api.test/v1/auth/refresh?x=1',
    'POST https://api.test/users/add',
    'PUT https://api.test/users/12',
    'GET https://api.test/auth/me',
    'POST https://api.test//auth//login',
    'POST https://api.test/users/add/',
    'POST https://api.test/AUTH/login?x=1',
    'GET https://api.test/auth/new-endpoint',
  ])('matches %s', (line) => {
    expect(matches(line)).toBe(true);
  });

  test.each([
    'GET https://api.test/products',
    'POST https://api.test/products/add',
    'GET https://api.test/users/12/posts',
    'GET https://api.test/products/add-ons',
    'GET https://api.test/authors',
  ])('ignores %s', (line) => {
    expect(matches(line)).toBe(false);
  });
});
