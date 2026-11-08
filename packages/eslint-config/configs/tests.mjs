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

const TEST_UTILS = String.raw`/^@test-utils(\/|$)/`;

/**
 * Test support stays in tests: `@test-utils/*` may be imported only by test files, stories (via
 * the shared exemption) and src/test-utils itself. Packages such as msw and @testing-library/*
 * are covered by the ownership policy.
 */
export const TEST_SUPPORT_ENTRIES = [
  {
    selector: [
      `ImportDeclaration[source.value=${TEST_UTILS}]`,
      `ExportNamedDeclaration[source.value=${TEST_UTILS}]`,
      `ExportAllDeclaration[source.value=${TEST_UTILS}]`,
      `ImportExpression[source.value=${TEST_UTILS}]`,
      `CallExpression[callee.name='require'][arguments.0.value=${TEST_UTILS}]`,
    ].join(', '),
    message:
      'Test helpers (@test-utils) are for tests and stories only. Move shared code to @shared or @services.',
    files: ['src/**', '.rnstorybook/**'],
    ignores: [
      ...TEST_FILES,
      '**/*.stories.tsx',
      'src/test-utils/**',
      // Dev mock mode reuses the MSW route table; the file is stripped from release bundles.
      'src/services/http/devMockAdapter.ts',
    ],
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
        // RNTL 14: render, fireEvent and userEvent all return promises.
        'testing-library/await-async-events': [
          'error',
          { eventModule: ['fireEvent', 'userEvent'] },
        ],
        'testing-library/await-async-utils': 'error',
        // Off because fireEvent is async here, so `await fireEvent.press()` is correct.
        'testing-library/no-await-sync-events': 'off',
      },
    },
  ];
}
