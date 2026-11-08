import globals from 'globals';
import jest from 'eslint-plugin-jest';
import testingLibrary from 'eslint-plugin-testing-library';

export const TEST_FILES = ['**/*.test.{ts,tsx}'];

/** Test-file syntax that needs a reviewer decision (warn): see `rn-tempo/discouraged-syntax`. */
export const TEST_ENTRIES = [
  {
    selector:
      'CallExpression[callee.property.name=/^(get|find|query)(All)?ByTestId$/], CallExpression[callee.name=/^(get|find|query)(All)?ByTestId$/]',
    message: 'Prefer getByRole (or another accessible query) over getByTestId.',
    files: TEST_FILES,
  },
];

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
      },
    },
  ];
}
