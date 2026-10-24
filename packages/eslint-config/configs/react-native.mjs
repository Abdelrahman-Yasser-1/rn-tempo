import { fixupPluginRules } from '@eslint/compat';
import reactNative from 'eslint-plugin-react-native';
import reactNativeA11y from 'eslint-plugin-react-native-a11y';

/**
 * React Native rules. Both plugins predate ESLint 10, so they are wrapped with `fixupPluginRules`.
 * `no-raw-text` is off because `i18next/no-literal-string` already covers user-facing text.
 */
export function reactNativeConfig() {
  return [
    {
      name: 'rn-tempo/react-native',
      files: ['**/*.{ts,tsx,js,jsx}'],
      plugins: {
        'react-native': fixupPluginRules(reactNative),
        'react-native-a11y': fixupPluginRules(reactNativeA11y),
      },
      rules: {
        'react-native/no-unused-styles': 'error',
        'react-native/no-inline-styles': 'error',
        'react-native/no-color-literals': 'error',
        'react-native/no-raw-text': 'off',
        'react-native-a11y/has-accessibility-hint': 'off',
        'react-native-a11y/has-valid-accessibility-role': 'error',
        'react-native-a11y/has-valid-accessibility-state': 'error',
        'react-native-a11y/has-valid-accessibility-actions': 'error',
        'react-native-a11y/no-nested-touchables': 'error',
      },
    },
  ];
}
