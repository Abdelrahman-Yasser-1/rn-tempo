import { useAuthStore } from '@features/auth';

import { interceptLink, isPublicPath, linkingPrefixes, toPath } from './linking';

beforeEach(() => {
  useAuthStore.setState({ status: 'signedOut', user: null, pendingLink: null });
});

describe('linking prefixes', () => {
  test('use the dev scheme from .env.dev and no https host when none is configured', () => {
    expect(linkingPrefixes).toEqual(['tempo-dev://']);
  });
});

describe('toPath', () => {
  test.each([
    ['tempo-dev://settings', 'settings'],
    ['tempo-dev://settings/theme/', 'settings/theme'],
    ['tempo-dev:///items/1?ref=push#top', 'items/1'],
    ['tempo-dev://', ''],
  ])('%s becomes "%s"', (url, expected) => {
    expect(toPath(url)).toBe(expected);
  });

  test('returns null for foreign urls', () => {
    expect(toPath('https://evil.test/settings')).toBeNull();
  });
});

describe('isPublicPath', () => {
  test.each([
    ['login', true],
    ['otp', true],
    ['', true],
    ['settings', false],
    ['items/1', false],
  ])('%s -> %s', (path, isPublic) => {
    expect(isPublicPath(path)).toBe(isPublic);
  });
});

describe('interceptLink', () => {
  test('passes everything through when signed in', () => {
    useAuthStore.setState({ status: 'signedIn' });

    expect(interceptLink('tempo-dev://settings')).toBe('tempo-dev://settings');
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });

  test('AC-9: parks a protected link when signed out and returns null', () => {
    expect(interceptLink('tempo-dev://items/7')).toBeNull();

    expect(useAuthStore.getState().pendingLink).toBe('tempo-dev://items/7');
  });

  test('lets auth links through when signed out', () => {
    expect(interceptLink('tempo-dev://login')).toBe('tempo-dev://login');
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });

  test('ignores missing and foreign urls', () => {
    expect(interceptLink(null)).toBeNull();
    expect(interceptLink(undefined)).toBeNull();
    expect(interceptLink('https://evil.test/x')).toBe('https://evil.test/x');
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });
});
