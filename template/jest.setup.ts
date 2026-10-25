import 'react-native-gesture-handler/jestSetup';

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

afterEach(() => {
  server.resetHandlers();
  jest.requireMock<{ resetKeychainMock: () => void }>('react-native-keychain').resetKeychainMock();
});

afterAll(() => {
  server.close();
});
