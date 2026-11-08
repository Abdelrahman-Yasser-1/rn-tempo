import { initPush } from '@services/push/push';
import { parsePushLink, resetPushRouting } from '@services/push/routing';

import { initPush as initPushStep } from './initPush';

jest.mock('@services/push/push', () => ({ initPush: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  resetPushRouting();
  jest.clearAllMocks();
});

describe('initPush step', () => {
  test('starts the push service', async () => {
    await initPushStep();

    expect(initPush).toHaveBeenCalledTimes(1);
  });

  test('links are checked against the app deep link paths', async () => {
    await initPushStep();

    expect(parsePushLink({ link: 'items/5' })).toBe('items/5');
    expect(parsePushLink({ link: 'not/a/screen' })).toBeNull();
  });
});
