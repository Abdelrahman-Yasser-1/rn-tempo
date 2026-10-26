import 'react-native-gesture-handler/jestSetup';

import { cleanup } from '@testing-library/react-native';

import { queryClient } from '@services/http/queryClient';
import { server } from '@test-utils/msw/server';

// Native modules are mocked once here; individual tests override behavior with jest.mocked().
jest.mock('react-native-reanimated', () =>
  jest.requireActual<object>('react-native-reanimated/mock'),
);
jest.mock('react-native-worklets', () =>
  jest.requireActual<object>('react-native-worklets/lib/module/mock'),
);
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual<object>('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@gorhom/bottom-sheet', () => jest.requireActual<object>('@gorhom/bottom-sheet/mock'));
// Rozenite talks to the React Native DevTools frontend, which does not exist under Jest.
jest.mock('@rozenite/mmkv-plugin', () => ({ useMMKVDevTools: jest.fn() }));
jest.mock('@rozenite/network-activity-plugin', () => ({ useNetworkActivityDevTools: jest.fn() }));
jest.mock('@rozenite/tanstack-query-plugin', () => ({ useTanStackQueryDevTools: jest.fn() }));
jest.mock('jail-monkey', () => ({
  __esModule: true,
  default: {
    isJailBroken: jest.fn(() => false),
    isDebuggedMode: jest.fn(() => Promise.resolve(false)),
    hookDetected: jest.fn(() => false),
  },
}));
jest.mock('react-native-ssl-public-key-pinning', () => ({
  isSslPinningAvailable: jest.fn(() => true),
  initializeSslPinning: jest.fn(() => Promise.resolve()),
  addSslPinningErrorListener: jest.fn(),
}));
jest.mock('react-native-bootsplash', () => ({
  __esModule: true,
  default: {
    hide: jest.fn().mockResolvedValue(undefined),
    isVisible: jest.fn().mockReturnValue(false),
  },
  hide: jest.fn().mockResolvedValue(undefined),
  isVisible: jest.fn().mockReturnValue(false),
}));

beforeAll(() => {
  // MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`.
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(async () => {
  // Unmount first (awaited): live Query observers keep stale/gc timers that stall Jest's exit.
  await cleanup();
  server.resetHandlers();
  // Clearing cancels the 5-minute gc timers that would otherwise keep the Jest process alive.
  queryClient.clear();
  // Tests that swap the keychain via jest.doMock bring their own fake without this helper.
  jest
    .requireMock<{ resetKeychainMock?: () => void }>('react-native-keychain')
    .resetKeychainMock?.();
});

afterAll(() => {
  // After RNTL's unmount cleanup, so gc timers started by unmounting observers are cancelled too.
  queryClient.clear();
  server.close();
});
