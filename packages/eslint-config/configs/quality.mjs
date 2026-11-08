import path from 'node:path';

import stylistic from '@stylistic/eslint-plugin';
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
import ts from 'typescript';

/**
 * The path aliases of the project (contract C4) as a regex for `import-x/internal-regex`, built
 * from `compilerOptions.paths` of its tsconfig.json: the one source Babel and Jest read too.
 * @param {string} root Absolute path of the project (the folder holding tsconfig.json).
 */
export function aliasRegex(root) {
  const file = path.join(root, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(file, ts.sys.readFile);
  if (error) {
    throw new Error(
      `Cannot read ${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }
  const names = Object.keys(config.compilerOptions?.paths ?? {}).map((alias) =>
    alias.replace(/\/\*$/, '').replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`),
  );
  return `^(${names.join('|')})(/|$)`;
}

const SOURCE_FILES = ['src/**/*.{ts,tsx}'];
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
      // Loose numbers on purpose: they catch the outliers, not the style.
      // Not enabled yet (too many existing violations to fix without refactoring app code):
      // max-lines-per-function (80), complexity (15) and rn-tempo/one-component-per-file.
      name: 'rn-tempo/quality/size',
      files: SOURCE_FILES,
      rules: {
        'max-params': ['error', 4],
        'max-depth': ['error', 4],
        'arrow-body-style': ['error', 'as-needed'],
      },
    },
    {
      name: 'rn-tempo/quality/length',
      files: SOURCE_FILES,
      ignores: [
        ...TEST_FILES,
        ...STORY_FILES,
        // A data table (country names, dial codes), not logic.
        'src/shared/constants/countries.ts',
      ],
      rules: { 'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }] },
    },
    {
      name: 'rn-tempo/quality/jsx',
      files: ['src/**/*.tsx'],
      plugins: { '@stylistic': stylistic },
      rules: {
        '@stylistic/jsx-self-closing-comp': ['error', { component: true, html: true }],
      },
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
        'import-x/internal-regex': aliasRegex(root),
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
