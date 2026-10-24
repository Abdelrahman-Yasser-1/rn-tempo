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
  keychain: {
    name: 'react-native-keychain',
    message: 'Only src/services/secure-storage (and storage/encryptionKey.ts) may import Keychain.',
  },
};

/**
 * Builds a `no-restricted-imports` entry that skips the named restrictions.
 * @param {string[]} allowed Keys of RESTRICTIONS that are allowed in the scoped files.
 */
function restrict(allowed = []) {
  const paths = Object.entries(RESTRICTIONS)
    .filter(([key]) => !allowed.includes(key))
    .map(([, value]) => value);
  return ['error', { paths }];
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
