import path from 'node:path';

import tanstackQuery from '@tanstack/eslint-plugin-query';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import i18next from 'eslint-plugin-i18next';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import noSecrets from 'eslint-plugin-no-secrets';
import promise from 'eslint-plugin-promise';
import regexp from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';

/** Path aliases of contract C4, as a regex for `import-x/internal-regex`. */
export const ALIAS_REGEX =
  '^@(app|navigation|features|shared|services|theme|assets|locales|config|test-utils)(/|$)';

const TEST_FILES = ['**/*.test.{ts,tsx}'];
const STORY_FILES = ['**/*.stories.tsx'];

/**
 * Quality plugins: sonarjs, unicorn (curated), promise, regexp, jsdoc, no-secrets, import-x,
 * TanStack Query and i18n.
 * @param {string} root Absolute path of the project (the folder holding tsconfig.json).
 */
export function qualityConfig(root) {
  return [
    sonarjs.configs.recommended,
    promise.configs['flat/recommended'],
    regexp.configs['flat/recommended'],
    ...tanstackQuery.configs['flat/recommended'],
    {
      name: 'rn-tempo/quality/sonarjs',
      rules: { 'sonarjs/cognitive-complexity': ['error', 15] },
    },
    {
      // Only the rules we have decided on; the rest of unicorn is deliberately not enabled.
      name: 'rn-tempo/quality/unicorn',
      plugins: { unicorn },
      rules: {
        'unicorn/prefer-node-protocol': 'error',
        'unicorn/no-for-each': 'error',
        'unicorn/prefer-string-replace-all': 'error',
        'unicorn/no-useless-undefined': 'error',
        'unicorn/prefer-ternary': 'warn',
        'unicorn/filename-case': 'off', // ls-lint owns file names
        'unicorn/no-null': 'off',
        'unicorn/prevent-abbreviations': 'off',
      },
    },
    {
      name: 'rn-tempo/quality/no-secrets',
      plugins: { 'no-secrets': noSecrets },
      rules: { 'no-secrets/no-secrets': ['error', { tolerance: 4.5 }] },
    },
    {
      name: 'rn-tempo/quality/jsdoc',
      files: ['src/services/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}'],
      ignores: [...TEST_FILES, ...STORY_FILES],
      plugins: { jsdoc },
      rules: {
        'jsdoc/require-jsdoc': [
          'error',
          {
            publicOnly: true,
            require: {
              FunctionDeclaration: true,
              ArrowFunctionExpression: true,
              FunctionExpression: true,
            },
          },
        ],
      },
    },
    {
      name: 'rn-tempo/quality/import-x',
      plugins: { 'import-x': importX },
      settings: {
        'import-x/extensions': ['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs'],
        'import-x/external-module-folders': ['node_modules', 'node_modules/@types'],
        'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'] },
        'import-x/internal-regex': ALIAS_REGEX,
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: path.join(root, 'tsconfig.json') }),
        ],
      },
      rules: {
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', 'parent', ['sibling', 'index']],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
        'import-x/no-cycle': 'error',
        'import-x/no-default-export': 'error',
      },
    },
    {
      // Storybook, tool configs and the RN entry point need a default export.
      name: 'rn-tempo/quality/default-export-exceptions',
      files: ['**/*.stories.tsx', '**/*.config.*', '**/index.js'],
      rules: { 'import-x/no-default-export': 'off' },
    },
    {
      name: 'rn-tempo/quality/i18n',
      files: ['src/**/*.tsx'],
      ignores: [...TEST_FILES, ...STORY_FILES],
      plugins: { i18next },
      rules: {
        'i18next/no-literal-string': [
          'error',
          {
            mode: 'jsx-only',
            'jsx-attributes': {
              exclude: [
                'className',
                'styleName',
                'style',
                'type',
                'key',
                'id',
                'width',
                'height',
                'testID',
                'accessibilityRole',
                'name',
                'variant',
              ],
            },
          },
        ],
      },
    },
  ];
}
