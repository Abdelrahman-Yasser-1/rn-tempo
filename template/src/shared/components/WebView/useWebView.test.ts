import { decideNavigation, isHostAllowed, isHttpsUrl, parseUrl } from './useWebView';

const HOSTS = ['dummyjson.com'];

describe('parseUrl', () => {
  test('reads the scheme and host, dropping credentials and the port', () => {
    expect(parseUrl('HTTPS://DummyJSON.com/products/1?x=1')).toEqual({
      protocol: 'https:',
      host: 'dummyjson.com',
    });
    expect(parseUrl('https://good.com@evil.com:8443/path')).toEqual({
      protocol: 'https:',
      host: 'evil.com',
    });
    expect(parseUrl('mailto:hi@example.com')).toEqual({ protocol: 'mailto:', host: '' });
    expect(parseUrl('not a url')).toBeNull();
  });

  test('handles edge cases of the address', () => {
    expect(parseUrl('  https://dummyjson.com  ')).toEqual({
      protocol: 'https:',
      host: 'dummyjson.com',
    });
    expect(parseUrl('https://dummyjson.com:8443')).toEqual({
      protocol: 'https:',
      host: 'dummyjson.com',
    });
    expect(parseUrl('https://dummyjson.com?x=1')).toEqual({
      protocol: 'https:',
      host: 'dummyjson.com',
    });
    expect(parseUrl('https://dummyjson.com#top')).toEqual({
      protocol: 'https:',
      host: 'dummyjson.com',
    });
    expect(parseUrl('tel:+966500000000')).toEqual({ protocol: 'tel:', host: '' });
    expect(parseUrl('')).toBeNull();
    expect(parseUrl('/relative')).toBeNull();
    expect(parseUrl('//dummyjson.com/x')).toBeNull();
    expect(parseUrl('java\nscript:alert(1)')).toBeNull();
  });

  test('reads a backslash as the end of the host, like the browser does', () => {
    // WebKit and Chromium treat `\` as `/` in special URLs, so this page is evil.com's.
    expect(parseUrl('https://evil.com\\@dummyjson.com/')).toEqual({
      protocol: 'https:',
      host: 'evil.com',
    });
  });
});

describe('isHostAllowed', () => {
  test('matches the host and its subdomains only', () => {
    expect(isHostAllowed('dummyjson.com', HOSTS)).toBe(true);
    expect(isHostAllowed('cdn.dummyjson.com', HOSTS)).toBe(true);
    expect(isHostAllowed('evildummyjson.com', HOSTS)).toBe(false);
    expect(isHostAllowed('dummyjson.com.evil.test', HOSTS)).toBe(false);
  });

  test('ignores case in the allowed list and rejects an empty list or host', () => {
    expect(isHostAllowed('dummyjson.com', ['DummyJSON.com'])).toBe(true);
    expect(isHostAllowed('dummyjson.com', [])).toBe(false);
    expect(isHostAllowed('', HOSTS)).toBe(false);
  });

  test('allows any of several hosts', () => {
    expect(isHostAllowed('b.test', ['a.test', 'b.test'])).toBe(true);
  });
});

describe('decideNavigation', () => {
  test.each([
    ['https://dummyjson.com/products/1', 'allow'],
    ['https://cdn.dummyjson.com/img.png', 'allow'],
    ['about:blank', 'allow'],
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the policy must refuse cleartext pages
    ['http://dummyjson.com/products/1', 'external'],
    ['https://example.com', 'external'],
    ['https://dummyjson.com@evil.com/', 'external'],
    ['mailto:help@example.com', 'external'],
    ['tel:+966500000000', 'external'],
    ['sms:+966500000000', 'external'],
    ['https://evil.com\\@dummyjson.com/', 'external'],
    ['javascript:alert(1)', 'block'],
    ['intent://scan/#Intent;scheme=zxing;end', 'block'],
    ['file:///etc/passwd', 'block'],
    ['data:text/html;base64,AAAA', 'block'],
    ['about:srcdoc', 'block'],
    ['garbage', 'block'],
  ] as const)('top frame %s is %s', (url, expected) => {
    expect(decideNavigation(url, HOSTS)).toBe(expected);
  });

  test('frames inside a page may load any web content but nothing else', () => {
    expect(decideNavigation('https://www.youtube.com/embed/x', HOSTS, false)).toBe('allow');
    expect(decideNavigation('javascript:void(0)', HOSTS, false)).toBe('block');
    expect(decideNavigation('http://ads.example.com/x', HOSTS, false)).toBe('allow');
    expect(decideNavigation('mailto:a@b.test', HOSTS, false)).toBe('block');
    expect(decideNavigation('about:blank', HOSTS, false)).toBe('allow');
  });

  test('matches no page when the allowed host list is empty', () => {
    expect(decideNavigation('https://dummyjson.com', [])).toBe('external');
  });
});

describe('isHttpsUrl', () => {
  test('accepts only absolute https addresses', () => {
    expect(isHttpsUrl('https://dummyjson.com/products/1')).toBe(true);
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the check must refuse cleartext
    expect(isHttpsUrl('http://dummyjson.com')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
    expect(isHttpsUrl('/relative/path')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl('HTTPS://DUMMYJSON.COM')).toBe(true);
    expect(isHttpsUrl('https:///path')).toBe(false);
  });
});
