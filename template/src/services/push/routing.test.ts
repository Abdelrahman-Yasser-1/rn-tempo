import { Linking } from 'react-native';

import { ENV } from '@config/env';
import { logger } from '@services/logger/logger';

import {
  flushPushLinks,
  openPushLink,
  parsePushLink,
  resetPushRouting,
  setPushPathValidator,
} from './routing';

const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
const KNOWN = new Set(['items/5', 'settings']);

beforeEach(() => {
  resetPushRouting();
  setPushPathValidator((path) => KNOWN.has(path));
  jest.clearAllMocks();
});

describe('parsePushLink', () => {
  test('accepts a known path and drops a leading slash', () => {
    expect(parsePushLink({ link: 'items/5' })).toBe('items/5');
    expect(parsePushLink({ link: '/settings' })).toBe('settings');
  });

  test.each([undefined, {}, { link: '' }, { link: null }])('ignores a missing link: %p', (data) => {
    expect(parsePushLink(data)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test.each([
    'https://evil.test/items/5',
    'other-app://items/5',
    '//evil.test/x',
    'items/5?token=abc',
    'items/../settings',
    'items/5#top',
    'a'.repeat(300),
  ])('ignores a foreign or unsafe link (%#) and warns without naming it', (link) => {
    expect(parsePushLink({ link })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('evil');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('token');
  });

  test('ignores a link that is not a string', () => {
    expect(parsePushLink({ link: { path: 'items/5' } })).toBeNull();
    expect(parsePushLink({ link: 5 })).toBeNull();
  });

  test('ignores a well-formed path the app does not have', () => {
    expect(parsePushLink({ link: 'unknown/screen' })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('refuses everything until a validator is set', () => {
    resetPushRouting();

    expect(parsePushLink({ link: 'items/5' })).toBeNull();
  });
});

describe('openPushLink', () => {
  test('keeps the link until the navigator is ready, then opens the last one', () => {
    openPushLink('items/5');
    openPushLink('settings');
    expect(openURL).not.toHaveBeenCalled();

    flushPushLinks();

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(`${ENV.DEEP_LINK_SCHEME}://settings`);
  });

  test('opens at once after the navigator is ready', () => {
    flushPushLinks();

    openPushLink('items/5');

    expect(openURL).toHaveBeenCalledWith(`${ENV.DEEP_LINK_SCHEME}://items/5`);
  });

  test('flushing with nothing waiting opens nothing', () => {
    flushPushLinks();

    expect(openURL).not.toHaveBeenCalled();
  });

  test('a failing open is a warning that names no link', async () => {
    openURL.mockRejectedValueOnce(new Error('no handler for tempo-dev://items/5'));
    flushPushLinks();

    openPushLink('items/5');
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith('Push: could not open a link', 'Error');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('items/5');
  });
});
