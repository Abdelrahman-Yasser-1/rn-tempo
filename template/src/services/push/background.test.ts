import { getApps } from '@react-native-firebase/app';
import { setBackgroundMessageHandler, type RemoteMessage } from '@react-native-firebase/messaging';

import { logger } from '@services/logger/logger';

import { registerPushBackgroundHandler } from './background';

const debug = jest.spyOn(logger, 'debug').mockImplementation(jest.fn());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getApps).mockReturnValue([{ name: '[DEFAULT]' }] as never);
});

describe('registerPushBackgroundHandler', () => {
  test('registers a handler that logs the message id and nothing from the payload', async () => {
    registerPushBackgroundHandler();
    const handler = jest.mocked(setBackgroundMessageHandler).mock.calls[0]?.[1];

    const message: RemoteMessage = {
      messageId: 'bg-1',
      notification: { title: 'SECRET-TITLE' },
      data: { secret: 'SECRET-DATA' },
    };
    await handler?.(message);

    expect(JSON.stringify(debug.mock.calls)).toContain('bg-1');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('SECRET');
  });

  test('does nothing when Firebase is not configured', () => {
    jest.mocked(getApps).mockReturnValue([]);

    registerPushBackgroundHandler();

    expect(setBackgroundMessageHandler).not.toHaveBeenCalled();
  });
});
