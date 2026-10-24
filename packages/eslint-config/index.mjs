import eslintConfigPrettier from 'eslint-config-prettier/flat';

import { boundariesConfig } from './configs/boundaries.mjs';
import { baseConfig } from './configs/base.mjs';
import { qualityConfig } from './configs/quality.mjs';
import { reactConfig } from './configs/react.mjs';
import { reactNativeConfig } from './configs/react-native.mjs';
import { restrictionsConfig } from './configs/restrictions.mjs';
import { testsConfig } from './configs/tests.mjs';

/**
 * Builds the RN-TEMPO flat config.
 * @param {{ root: string, structure?: boolean }} options `root` is the project folder (usually `import.meta.dirname`).
 */
export function createConfig({ root, structure = false }) {
  return [
    ...baseConfig(root),
    ...reactConfig(),
    ...reactNativeConfig(),
    ...qualityConfig(root),
    ...restrictionsConfig(),
    ...testsConfig(),
    ...(structure ? boundariesConfig(root) : []),
    eslintConfigPrettier,
  ];
}
