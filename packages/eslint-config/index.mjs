import eslintConfigPrettier from 'eslint-config-prettier/flat';

import { baseConfig } from './configs/base.mjs';
import { reactConfig } from './configs/react.mjs';
import { reactNativeConfig } from './configs/react-native.mjs';

/**
 * Builds the RN-TEMPO flat config.
 * @param {{ root: string, structure?: boolean }} options `root` is the project folder (usually `import.meta.dirname`).
 */
export function createConfig({ root }) {
  return [...baseConfig(root), ...reactConfig(), ...reactNativeConfig(), eslintConfigPrettier];
}
