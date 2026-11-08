import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

import { TS_FILES } from './base.mjs';

/** React rules: @eslint-react (recommended-typescript) and the Rules of Hooks. */
export function reactConfig() {
  return [
    { ...eslintReact.configs['recommended-typescript'], files: TS_FILES },
    { ...reactHooks.configs.flat.recommended, name: 'react-hooks/recommended' },
    {
      // Index keys reorder wrongly when a list changes; the recommended preset only warns.
      name: 'rn-tempo/react/keys',
      files: TS_FILES,
      rules: { '@eslint-react/no-array-index-key': 'error' },
    },
  ];
}
