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
});

describe('isHostAllowed', () => {
  test('matches the host and its subdomains only', () => {
    expect(isHostAllowed('dummyjson.com', HOSTS)).toBe(true);
    expect(isHostAllowed('cdn.dummyjson.com', HOSTS)).toBe(true);
    expect(isHostAllowed('evildummyjson.com', HOSTS)).toBe(false);
    expect(isHostAllowed('dummyjson.com.evil.test', HOSTS)).toBe(false);
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
  });
});
