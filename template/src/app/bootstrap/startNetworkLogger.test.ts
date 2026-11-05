import type * as NetworkLogger from 'react-native-network-logger';

import type * as Starter from './startNetworkLogger';

/** Loads the module against a fake `isProd`; the logger mock comes from the same fresh registry. */
function load(isProd: boolean) {
  jest.resetModules();
  jest.doMock('@config/env', () => ({ isProd }));
  let starter: typeof Starter | undefined;
  let logger: typeof NetworkLogger | undefined;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- fresh modules against the faked env */
    starter = require('./startNetworkLogger') as typeof Starter;
    logger = require('react-native-network-logger') as typeof NetworkLogger;
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  if (!starter || !logger) {
    throw new Error('modules did not load');
  }
  return { starter, start: jest.mocked(logger.startNetworkLogging) };
}

describe('startNetworkLogger', () => {
  it('starts the logger with a request cap and ignore patterns outside production', () => {
    const { starter, start } = load(false);
    starter.startNetworkLogger();

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      maxRequests: 200,
      ignoredPatterns: starter.networkLogIgnoredPatterns(),
    });
  });

  it('never starts the logger in production', () => {
    const { starter, start } = load(true);
    starter.startNetworkLogger();

    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    'POST https://api.test/auth/login',
    'POST https://api.test/users/add',
    'PUT https://api.test/users/3',
    'POST http://localhost:8081/symbolicate',
    'GET http://localhost:8081/index.bundle?platform=ios',
    'GET http://localhost:8081/status',
    'HEAD https://clients3.google.com/generate_204?_=1794140251210',
  ])('hides %s', (line) => {
    const patterns = load(false).starter.networkLogIgnoredPatterns();

    expect(patterns.some((pattern) => pattern.test(line))).toBe(true);
  });

  it('shows ordinary requests', () => {
    const patterns = load(false).starter.networkLogIgnoredPatterns();

    expect(patterns.some((pattern) => pattern.test('GET https://api.test/products'))).toBe(false);
  });
});
