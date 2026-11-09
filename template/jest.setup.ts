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
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual<object>('react-native-keyboard-controller/jest'),
);
// react-native-shake ships no jest mock; tests grab the listener from `addListener` to fire a shake.
jest.mock('react-native-shake', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
    configure: jest.fn(),
  },
}));
// react-native-network-logger patches XHR and ships no jest mock; the viewer renders a labelled View.
jest.mock('react-native-network-logger', () => {
  const { View } = jest.requireActual<{ View: ComponentType<{ testID?: string }> }>('react-native');
  const { createElement: h } = jest.requireActual<{ createElement: typeof createElement }>('react');
  return {
    __esModule: true,
    default: (props: { testID?: string }) => h(View, { ...props, testID: 'network-logger' }),
    startNetworkLogging: jest.fn(),
    stopNetworkLogging: jest.fn(),
    getBackHandler: jest.fn((back: () => void) => back),
  };
});
jest.mock('@rozenite/mmkv-plugin', () => ({ useMMKVDevTools: jest.fn() }));
jest.mock('@rozenite/network-activity-plugin', () => ({ useNetworkActivityDevTools: jest.fn() }));
jest.mock('@rozenite/tanstack-query-plugin', () => ({ useTanStackQueryDevTools: jest.fn() }));
// @tempo-feature:device-integrity:start
jest.mock('jail-monkey', () => ({
  __esModule: true,
  default: {
    isJailBroken: jest.fn(() => false),
    isDebuggedMode: jest.fn(() => Promise.resolve(false)),
    hookDetected: jest.fn(() => false),
  },
}));
// @tempo-feature:device-integrity:end
// @tempo-feature:ssl-pinning:start
jest.mock('react-native-ssl-public-key-pinning', () => ({
  isSslPinningAvailable: jest.fn(() => true),
  initializeSslPinning: jest.fn(() => Promise.resolve()),
  addSslPinningErrorListener: jest.fn(),
}));
// @tempo-feature:ssl-pinning:end
jest.mock('react-native-bootsplash', () => ({
  __esModule: true,
  default: {
    hide: jest.fn().mockResolvedValue(undefined),
    isVisible: jest.fn().mockReturnValue(false),
  },
  hide: jest.fn().mockResolvedValue(undefined),
  isVisible: jest.fn().mockReturnValue(false),
}));
// @tempo-feature:webview:start
// The native web view needs a device. The mock renders a labelled View that receives every prop
// (so tests can call `onShouldStartLoadWithRequest` and friends) and has a `reload` method.
jest.mock('react-native-webview', () => {
  const React = jest.requireActual<{
    createElement: typeof createElement;
    Component: typeof Component;
  }>('react');
  const { View } = jest.requireActual<{ View: ComponentType<Record<string, unknown>> }>(
    'react-native',
  );
  const reload = jest.fn();
  class WebView extends React.Component<object> {
    // eslint-disable-next-line @eslint-react/no-unused-class-component-members -- called through the ref
    reload = reload;

    override render() {
      return React.createElement(View, { ...this.props, accessibilityLabel: 'Web view' });
    }
  }
  return { __esModule: true, default: WebView, WebView, mockReload: reload };
});
// @tempo-feature:webview:end
// @tempo-feature:maps:start
// The native map needs a device. The mock renders a labelled View that receives every prop (so
// tests can call `onRegionChangeComplete` and `onUserLocationChange`) and records `animateToRegion`.
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<{
    createElement: typeof createElement;
    Component: typeof Component;
  }>('react');
  const { View } = jest.requireActual<{ View: ComponentType<Record<string, unknown>> }>(
    'react-native',
  );
  const animateToRegion = jest.fn();
  class MapView extends React.Component<Record<string, unknown>> {
    // eslint-disable-next-line @eslint-react/no-unused-class-component-members -- called through the ref
    animateToRegion = animateToRegion;

    override render() {
      return React.createElement(View, { ...this.props, accessible: true });
    }
  }
  return {
    __esModule: true,
    default: MapView,
    PROVIDER_DEFAULT: undefined,
    PROVIDER_GOOGLE: 'google',
    mockAnimateToRegion: animateToRegion,
  };
});
// @tempo-feature:maps:end
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
// @tempo-feature:firebase-core:start
// Firebase needs a device and a config file. The default app exists here; tests set `getApps` to `[]`
// for the "not configured" case and `ENV.FIREBASE_ENABLED` (jest.replaceProperty) for the env switch.
jest.mock('@react-native-firebase/app', () => ({
  getApps: jest.fn(() => [{ name: '[DEFAULT]' }]),
}));
// @tempo-feature:firebase-core:end
// @tempo-feature:push-notifications:start
// Tests drive the mocked messaging functions (jest.mocked).
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(() => Promise.resolve('fcm-token')),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  setBackgroundMessageHandler: jest.fn(),
  hasPermission: jest.fn(() => Promise.resolve(-1)),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  setAutoInitEnabled: jest.fn(() => Promise.resolve()),
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  },
}));
// @tempo-feature:push-notifications:end
// @tempo-feature:crashlytics:start
// Crashlytics needs a device; tests assert on the mocked calls (jest.mocked).
jest.mock('@react-native-firebase/crashlytics', () => ({
  deleteUnsentReports: jest.fn(() => Promise.resolve()),
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setAttributes: jest.fn(() => Promise.resolve(null)),
  setUserId: jest.fn(() => Promise.resolve(null)),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve(null)),
}));
// @tempo-feature:crashlytics:end

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
