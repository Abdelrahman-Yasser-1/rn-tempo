import { rnTempoPlugin } from '../plugin/index.mjs';

const free = (reason) => ({ kind: 'free', reason });
const owned = (owners, message) => ({ kind: 'owned', owners, message });
const native = (reason, owners) => ({ kind: 'native', reason, ...(owners ? { owners } : {}) });

/**
 * Who may import each package. One entry per runtime dependency of the template:
 * - `owned`: only the files matching `owners` (globs relative to the project root) may import it.
 * - `free`: framework-level, usable anywhere.
 * - `native`: linked by autolinking or the native build; no JS import is expected.
 *
 * Keys may end with `*` to cover a family of packages (`@testing-library/*`). Packages that are
 * not listed are not checked here; `yarn lint:deps` fails on an unlisted runtime dependency.
 * Entries of packages a project does not have (removed feature modules) are harmless.
 */
export const DEPENDENCY_POLICY = {
  // Framework level.
  react: free('Core library.'),
  'react-native': free('Core library; its component names are restricted separately.'),
  '@react-navigation/*': free('Navigation is used by screens, navigators and hooks.'),
  '@tanstack/react-query': free('Server state is used in feature api folders and hooks.'),
  'react-hook-form': free('Forms are built in screens and shared form components.'),
  '@hookform/resolvers': free('Goes with react-hook-form and zod.'),
  zod: free('Schemas live in api, types and config folders.'),
  zustand: free('Stores live in features and services.'),
  i18next: free('Types and helpers are shared with react-i18next.'),
  'react-i18next': free('Translations are used by every screen and component.'),
  'react-native-unistyles': free('All styling goes through Unistyles.'),
  'react-native-reanimated': free('Animations are used by shared components and hooks.'),
  'react-native-gesture-handler': free('Gesture components and the root view are used widely.'),
  'react-native-safe-area-context': free('Insets are read by layout components and providers.'),

  // Services and adapters.
  axios: owned(['src/services/http/**'], 'Make requests through @services/http.'),
  'react-native-mmkv': owned(
    ['src/services/storage/**'],
    'Use @services/storage; only it may use MMKV.',
  ),
  'react-native-keychain': owned(
    ['src/services/secure-storage/**', 'src/services/storage/encryptionKey.ts'],
    'Use @services/secure-storage for tokens.',
  ),
  '@react-native-documents/picker': owned(
    ['src/services/files/**'],
    'Pick documents through @services/files.',
  ),
  'react-native-image-picker': owned(
    ['src/services/files/**'],
    'Pick images through @services/files.',
  ),
  '@react-native-community/netinfo': owned(
    [
      'src/services/network/**',
      'src/services/http/queryClient.ts',
      'src/shared/components/ConnectionModal/**',
    ],
    'Use @services/network (useIsOnline) instead of NetInfo.',
  ),
  'react-native-localize': owned(
    ['src/services/i18n/**'],
    'Read the device locale through @services/i18n.',
  ),
  'react-native-restart': owned(
    ['src/services/i18n/**', 'src/shared/components/ErrorBoundary/**'],
    'Restarting the app belongs to @services/i18n (language switch) and ErrorBoundary.',
  ),
  'react-native-toast-message': owned(
    ['src/services/toast/**', 'src/shared/components/ToastHost/**'],
    'Show toasts through @services/toast.',
  ),
  'react-native-config': owned(['src/config/env.ts'], 'Read configuration from @config/env.'),
  'jail-monkey': owned(
    ['src/services/security/integrity/**'],
    'Device integrity checks live in @services/security.',
  ),
  'react-native-ssl-public-key-pinning': owned(
    ['src/services/security/pinning/**'],
    'Certificate pinning lives in @services/security.',
  ),
  'react-native-bootsplash': owned(
    ['src/app/bootstrap/**'],
    'The splash screen is hidden from app bootstrap.',
  ),
  'react-native-network-logger': owned(
    ['src/app/bootstrap/**', 'src/app/screens/NetworkLogScreen/**'],
    'The network logger is started in bootstrap and shown in NetworkLogScreen.',
  ),
  'react-native-shake': owned(
    ['src/app/providers/**'],
    'Shake detection belongs to the app providers.',
  ),

  '@react-native-firebase/app': owned(
    ['src/services/push/**'],
    'Push notifications live in src/services/push; do not call Firebase from other code.',
  ),
  '@react-native-firebase/messaging': owned(
    ['src/services/push/**'],
    'Use @services/push for tokens, permission and notification links.',
  ),

  // UI libraries wrapped by one shared component.
  'react-native-svg': owned(
    ['src/shared/components/Icon/**', 'src/assets/generated/**'],
    'Draw icons with <Icon name=... /> from @shared/components.',
  ),
  '@d11/react-native-fast-image': owned(
    ['src/shared/components/{Image,Avatar,UserCard}/**'],
    'Use <Image /> from @shared/components for remote images.',
  ),
  '@gorhom/bottom-sheet': owned(
    ['src/shared/components/**', 'src/app/providers/**'],
    'Use <BottomSheet /> from @shared/components.',
  ),
  '@shopify/flash-list': owned(
    ['src/shared/components/PaginatedList/**'],
    'Use <PaginatedList /> from @shared/components for long lists.',
  ),
  '@react-native-community/datetimepicker': owned(
    ['src/shared/components/{TimePicker,TimePickerSheet}/**'],
    'Use <TimePicker /> or <DatePicker /> from @shared/components.',
  ),
  '@react-native-community/slider': owned(
    ['src/shared/components/Slider/**'],
    'Use <Slider /> from @shared/components.',
  ),
  'react-native-fast-shimmer': owned(
    ['src/shared/components/{Bone,Skeleton}/**'],
    'Use <Skeleton /> or <Bone /> from @shared/components.',
  ),
  'react-native-keyboard-controller': owned(
    ['src/app/providers/**', 'src/shared/components/Screen/**'],
    'Keyboard handling belongs to <Screen /> and the app providers.',
  ),
  'react-native-maps': owned(
    ['src/shared/components/MapPicker/**'],
    'Use <MapPicker /> from @shared/components.',
  ),
  'react-native-webview': owned(
    ['src/shared/components/WebView/**'],
    'Use <WebView /> from @shared/components.',
  ),

  // Native-only packages.
  '@react-native/normalize-colors': native('Used by the native build tooling, not by app code.'),
  'react-native-edge-to-edge': native(
    'Configured natively (Android edge-to-edge); nothing to import.',
  ),
  'react-native-get-random-values': native('A polyfill; only the app entry points load it.', [
    'index.js',
    '.rnstorybook/index.tsx',
  ]),
  'react-native-nitro-modules': native(
    'Runtime of Nitro native modules (MMKV); never imported by app code.',
  ),
  'react-native-screens': native('Used by React Navigation; app code does not import it.'),
  'react-native-worklets': native(
    'Babel plugin and Reanimated runtime; app code does not import it.',
  ),

  // Test support (devDependencies): imported only by tests, stories and src/test-utils.
  '@testing-library/*': owned(
    ['src/test-utils/**'],
    'Testing Library belongs in test files and src/test-utils.',
  ),
  msw: owned(['src/test-utils/**'], 'MSW belongs in test files and src/test-utils/msw.'),
  'test-renderer': owned(
    ['src/test-utils/**'],
    'test-renderer belongs in test files and src/test-utils.',
  ),
  'jest-*': owned(['src/test-utils/**'], 'Jest helpers belong in test files and src/test-utils.'),
  '@jest/*': owned(['src/test-utils/**'], 'Jest helpers belong in test files and src/test-utils.'),
};

/**
 * Config block for `rn-tempo/dependency-owner`.
 * @param {Record<string, object>} [additions] Project entries merged over `DEPENDENCY_POLICY`.
 */
export function dependenciesConfig(additions = {}) {
  return [
    {
      name: 'rn-tempo/dependencies',
      files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      plugins: { 'rn-tempo': rnTempoPlugin },
      rules: { 'rn-tempo/dependency-owner': ['error', { ...DEPENDENCY_POLICY, ...additions }] },
    },
  ];
}
