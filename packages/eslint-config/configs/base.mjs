import globals from 'globals';
import tseslint from 'typescript-eslint';

export const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
export const JS_FILES = ['**/*.{js,mjs,cjs}'];

/** Boolean names must read as a question (contract C5). */
export const BOOLEAN_PREFIXES = [
  'is',
  'has',
  'should',
  'can',
  'did',
  'will',
  'show',
  'hide',
  'was',
  'could',
  'needs',
  'allows',
  'wants',
  'requires',
];

export const ENUM_RESTRICTION = {
  selector: 'TSEnumDeclaration',
  message: 'Enums are forbidden. Use an `as const` object plus a union type.',
};

const scoped = (configs, files) => configs.map((config) => ({ ...config, files }));

/**
 * TypeScript baseline: typescript-eslint strict + stylistic (type-checked), naming and core rules.
 * @param {string} root Absolute path of the project (the folder holding tsconfig.json).
 */
export function baseConfig(root) {
  return [
    ...scoped(tseslint.configs.strictTypeChecked, TS_FILES),
    ...scoped(tseslint.configs.stylisticTypeChecked, TS_FILES),
    {
      name: 'rn-tempo/base/language',
      languageOptions: {
        globals: { __DEV__: 'readonly' },
      },
    },
    {
      name: 'rn-tempo/base/typescript',
      files: TS_FILES,
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: root },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        // React Navigation param lists must be type aliases (interfaces lack the index signature).
        '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
        '@typescript-eslint/consistent-type-exports': [
          'error',
          { fixMixedExportsWithInlineTypeSpecifier: true },
        ],
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'variable',
            format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
            leadingUnderscore: 'allow',
          },
          {
            selector: 'variable',
            modifiers: ['destructured'],
            format: null,
          },
          {
            selector: 'parameter',
            modifiers: ['destructured'],
            format: null,
          },
          {
            selector: 'function',
            format: ['camelCase', 'PascalCase'],
          },
          {
            selector: 'parameter',
            format: ['camelCase'],
            leadingUnderscore: 'allow',
          },
          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },
          {
            // Constants (UPPER_CASE) are exempt: IS_/HAS_ prefixes read badly there.
            selector: ['variable', 'parameter'],
            types: ['boolean'],
            format: ['PascalCase'],
            prefix: BOOLEAN_PREFIXES,
            filter: { regex: '^_?[A-Z][A-Z0-9_]*$', match: false },
          },
        ],
      },
    },
    {
      name: 'rn-tempo/base/javascript',
      files: JS_FILES,
      ...tseslint.configs.disableTypeChecked,
      languageOptions: { globals: { ...globals.node, __DEV__: 'readonly' } },
    },
    {
      name: 'rn-tempo/base/core',
      rules: {
        'no-console': 'error',
        eqeqeq: 'error',
        curly: ['error', 'all'],
        'no-restricted-syntax': ['error', ENUM_RESTRICTION],
      },
    },
    {
      // CLI scripts talk to the terminal; app code never does.
      name: 'rn-tempo/base/scripts',
      files: ['scripts/**'],
      rules: { 'no-console': 'off' },
    },
  ];
}
