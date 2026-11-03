const RN_COMPONENTS = [
  'Text',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Image',
  'Button',
  'TextInput',
];

const RESTRICTIONS = {
  reactNative: {
    name: 'react-native',
    importNames: RN_COMPONENTS,
    message: 'Use @shared/components and react-native-unistyles instead.',
  },
  // Never allowed, not even in shared components: styles come from react-native-unistyles.
  reactNativeStyleSheet: {
    name: 'react-native',
    importNames: ['StyleSheet'],
    message: 'Use StyleSheet from react-native-unistyles instead.',
  },
  config: { name: 'react-native-config', message: 'Use @config/env instead.' },
  asyncStorage: {
    name: '@react-native-async-storage/async-storage',
    message: 'Use @services/storage instead.',
  },
  axios: { name: 'axios', message: 'Only src/services/http may import axios.' },
  mmkv: { name: 'react-native-mmkv', message: 'Only src/services/storage may import MMKV.' },
  reactNativeSvg: {
    name: 'react-native-svg',
    message: 'Draw icons with <Icon name=... /> from @shared/components; only Icon uses react-native-svg.',
  },
  keychain: {
    name: 'react-native-keychain',
    message: 'Only src/services/secure-storage (and storage/encryptionKey.ts) may import Keychain.',
  },
};

// Pattern restrictions, by key. `svgFiles` is skipped by `allowed`; `catalogue` never is.
const PATTERN_RESTRICTIONS = {
  svgFiles: {
    group: ['*.svg', '**/*.svg'],
    message: 'Use <Icon name=... /> from @shared/components. Add icons with `yarn icons:add`.',
  },
  catalogue: {
    group: ['assets-catalog', 'assets-catalog/**', '**/assets-catalog', '**/assets-catalog/**'],
    message:
      'The icon catalogue is never bundled. Copy an icon into src/assets/icons with `yarn icons:add`.',
  },
};

/**
 * Builds a `no-restricted-imports` entry that skips the named restrictions.
 * @param {string[]} allowed Keys of RESTRICTIONS or PATTERN_RESTRICTIONS that are allowed in the scoped files.
 */
function restrict(allowed = []) {
  const paths = Object.entries(RESTRICTIONS)
    .filter(([key]) => !allowed.includes(key))
    .map(([, value]) => value);
  const patterns = Object.entries(PATTERN_RESTRICTIONS)
    .filter(([key]) => !allowed.includes(key))
    .map(([, value]) => value);
  return ['error', { paths, patterns }];
}

/** Import restrictions (error). Each allowed location re-declares the rule without that entry. */
export function restrictionsConfig() {
  return [
    { name: 'rn-tempo/restrictions', rules: { 'no-restricted-imports': restrict() } },
    {
      name: 'rn-tempo/restrictions/shared-components',
      files: ['src/shared/components/**'],
      rules: { 'no-restricted-imports': restrict(['reactNative']) },
    },
    {
      // Icon draws the generated react-native-svg components; nothing else does.
      name: 'rn-tempo/restrictions/icon',
      files: ['src/shared/components/Icon/**', 'src/assets/generated/**'],
      rules: { 'no-restricted-imports': restrict(['reactNative', 'reactNativeSvg', 'svgFiles']) },
    },
    {
      name: 'rn-tempo/restrictions/env',
      files: ['src/config/env.ts'],
      rules: { 'no-restricted-imports': restrict(['config']) },
    },
    {
      name: 'rn-tempo/restrictions/http',
      files: ['src/services/http/**'],
      rules: { 'no-restricted-imports': restrict(['axios']) },
    },
    {
      name: 'rn-tempo/restrictions/storage',
      files: ['src/services/storage/**'],
      rules: { 'no-restricted-imports': restrict(['mmkv']) },
    },
    {
      name: 'rn-tempo/restrictions/storage-key',
      files: ['src/services/storage/encryptionKey.ts'],
      rules: { 'no-restricted-imports': restrict(['mmkv', 'keychain']) },
    },
    {
      name: 'rn-tempo/restrictions/secure-storage',
      files: ['src/services/secure-storage/**'],
      rules: { 'no-restricted-imports': restrict(['keychain']) },
    },
  ];
}

const SCREEN_LOGIC_MESSAGE = 'Move screen logic into use<Name>Screen.ts (WS9b convention).';

/**
 * Screen views stay presentational (WS9b): logic imports are warned about. Uses the
 * typescript-eslint rule so type-only imports stay allowed and the core rule block above is
 * not overwritten.
 */
export function screenLogicConfig() {
  return [
    {
      name: 'rn-tempo/restrictions/screen-logic',
      files: ['src/**/screens/**/*Screen.tsx'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'warn',
          {
            paths: [
              { name: 'react-hook-form', message: SCREEN_LOGIC_MESSAGE, allowTypeImports: true },
              {
                name: '@tanstack/react-query',
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
              {
                name: '@react-navigation/native',
                importNames: ['useNavigation', 'useRoute', 'useFocusEffect'],
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
              {
                name: 'react',
                importNames: ['useState', 'useEffect', 'useReducer'],
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
            ],
          },
        ],
      },
    },
  ];
}
