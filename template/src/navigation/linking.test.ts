import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';

import { interceptLink, isPublicPath, linkingPrefixes, toPath } from './linking';
import { isKnownLinkPath } from './linking'; // @tempo-feature:push-notifications

// The scheme is renamed per project, so tests read it from the env instead of hard-coding it.
const SCHEME = `${ENV.DEEP_LINK_SCHEME}://`;

beforeEach(() => {
  useAuthStore.setState({ status: 'signedOut', user: null, pendingLink: null });
});

describe('linking prefixes', () => {
  test('use the dev scheme from .env.dev and no https host when none is configured', () => {
    expect(linkingPrefixes).toEqual([SCHEME]);
  });
});

describe('toPath', () => {
  test.each([
    [`${SCHEME}settings`, 'settings'],
    [`${SCHEME}settings/theme/`, 'settings/theme'],
    [`${SCHEME}/items/1?ref=push#top`, 'items/1'],
    [SCHEME, ''],
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

    expect(interceptLink(`${SCHEME}settings`)).toBe(`${SCHEME}settings`);
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });

  test('AC-9: parks a protected link when signed out and returns null', () => {
    expect(interceptLink(`${SCHEME}items/7`)).toBeNull();

    expect(useAuthStore.getState().pendingLink).toBe(`${SCHEME}items/7`);
  });

  test('lets auth links through when signed out', () => {
    expect(interceptLink(`${SCHEME}login`)).toBe(`${SCHEME}login`);
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });

  test('ignores missing and foreign urls', () => {
    expect(interceptLink(null)).toBeNull();
    expect(interceptLink(undefined)).toBeNull();
    expect(interceptLink('https://evil.test/x')).toBe('https://evil.test/x');
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });
});

// @tempo-feature:push-notifications:start
describe('isKnownLinkPath', () => {
  test.each(['home', 'items', 'items/new', 'items/5', 'settings/theme', 'profile/edit'])(
    '%s is a known path',
    (path) => {
      expect(isKnownLinkPath(path)).toBe(true);
    },
  );

  test.each(['', 'nope', 'items/5/extra', 'settings/unknown', 'https://evil.test'])(
    '"%s" is not a known path',
    (path) => {
      expect(isKnownLinkPath(path)).toBe(false);
    },
  );

  test('a notification link opened while signed out is parked until sign-in', () => {
    // The push service opens `<scheme>://<path>`, which arrives here like any deep link.
    const url = `${SCHEME}items/5`;

    expect(interceptLink(url)).toBeNull();

    expect(useAuthStore.getState().pendingLink).toBe(url);
  });
});
// @tempo-feature:push-notifications:end
