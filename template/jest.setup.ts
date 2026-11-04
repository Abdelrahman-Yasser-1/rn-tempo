import 'react-native-gesture-handler/jestSetup';

import { cleanup } from '@testing-library/react-native';
import type { Component, ComponentType, Fragment, ReactNode, createElement } from 'react';

import { queryClient } from '@services/http/queryClient';
import { server } from '@test-utils/msw/server';

type ModalProps = {
  children?: ReactNode;
  footerComponent?: ComponentType<{ animatedFooterPosition: { value: number } }>;
};

// Native modules are mocked once here; individual tests override behavior with jest.mocked().
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
// The stock gorhom mock has no footer support: it neither exports `BottomSheetFooter` nor renders
// `footerComponent`, so both are added here (the footer renders right after the content).
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<{
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  }>('react');
  const mock = jest.requireActual<{ BottomSheetModal: typeof Component<ModalProps> }>(
    '@gorhom/bottom-sheet/mock',
  );
  class BottomSheetModal extends mock.BottomSheetModal {
    override render() {
      const Footer = this.props.footerComponent;
      return React.createElement(
        React.Fragment,
        null,
        super.render(),
        Footer ? React.createElement(Footer, { animatedFooterPosition: { value: 0 } }) : null,
      );
    }
  }
  const BottomSheetFooter = ({ children }: { children?: ReactNode }) => children;
  return { ...mock, BottomSheetModal, BottomSheetFooter };
});
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
// @tempo-feature:file-picker:start
// The native pickers need a device; tests drive the mocked `pick`, `launchCamera` and
// `launchImageLibrary` (jest.mocked) instead.
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  errorCodes: {
    OPERATION_CANCELED: 'OPERATION_CANCELED',
    ASYNC_OP_IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    UNABLE_TO_OPEN_FILE_TYPE: 'UNABLE_TO_OPEN_FILE_TYPE',
    NULL_PRESENTER: 'NULL_PRESENTER',
  },
  isErrorWithCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error,
}));
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));
// @tempo-feature:file-picker:end

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
