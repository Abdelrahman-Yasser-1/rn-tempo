import globals from 'globals';
import jest from 'eslint-plugin-jest';
import testingLibrary from 'eslint-plugin-testing-library';

import { ENUM_RESTRICTION } from './base.mjs';

export const TEST_FILES = ['**/*.test.{ts,tsx}'];

/** Jest and Testing Library rules for `*.test.ts(x)`. */
export function testsConfig() {
  return [
    { ...jest.configs['flat/recommended'], files: TEST_FILES },
    { ...testingLibrary.configs['flat/react'], files: TEST_FILES },
    {
      name: 'rn-tempo/tests',
      files: TEST_FILES,
      languageOptions: { globals: globals.jest },
      // Pinned: auto-detection resolves from this package, where jest is not installed.
      settings: { jest: { version: 30 } },
      rules: {
        'testing-library/prefer-screen-queries': 'error',
        // Warn only: the reviewer decides whether a role query was possible.
        // This key replaces the base `no-restricted-syntax`, so the enum ban is repeated here.
        'no-restricted-syntax': [
          'warn',
          ENUM_RESTRICTION,
          {
            selector:
              "CallExpression[callee.property.name=/^(get|find|query)(All)?ByTestId$/], CallExpression[callee.name=/^(get|find|query)(All)?ByTestId$/]",
            message: 'Prefer getByRole (or another accessible query) over getByTestId.',
          },
        ],
      },
    },
  ];
}
