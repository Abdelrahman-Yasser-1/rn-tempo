import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

import { createConfig } from '../index.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Lints every file of a fixture project and returns { 'src/...': ['rule/id', ...] }. */
async function lintFixture(name) {
  const cwd = path.join(fixtures, name);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: createConfig({ root: cwd, structure: true }),
  });
  const results = await eslint.lintFiles(['src/**']);
  return Object.fromEntries(
    results.map((result) => [
      path.relative(cwd, result.filePath),
      result.messages.map((message) => message.ruleId),
    ]),
  );
}

describe('eslint-config fixtures', () => {
  let valid;
  let invalid;

  beforeAll(async () => {
    [valid, invalid] = await Promise.all([lintFixture('valid'), lintFixture('invalid')]);
  }, 120_000);

  it('accepts the valid fixture without a single message', () => {
    expect(Object.keys(valid).length).toBeGreaterThan(5);
    const withMessages = Object.entries(valid).filter(([, rules]) => rules.length > 0);
    expect(withMessages).toEqual([]);
  });

  const cases = [
    ['shared importing a feature', 'src/shared/utils/importsFeature.ts', 'boundaries/dependencies'],
    [
      'a deep import into another feature',
      'src/features/auth/utils/deepImport.ts',
      'boundaries/dependencies',
    ],
    ['services importing shared-ui', 'src/services/http/usesUi.ts', 'boundaries/dependencies'],
    ['raw Text', 'src/features/home/components/RawText/RawText.tsx', 'no-restricted-imports'],
    [
      'react-native-config outside env',
      'src/services/http/readsConfig.ts',
      'no-restricted-imports',
    ],
    ['axios outside services/http', 'src/services/storage/usesAxios.ts', 'no-restricted-imports'],
    [
      'react-native StyleSheet in a shared component',
      'src/shared/components/RnSheet/RnSheet.tsx',
      'no-restricted-imports',
    ],
    ['an enum', 'src/shared/types/status.ts', 'no-restricted-syntax'],
    ['console', 'src/shared/utils/logs.ts', 'no-console'],
    [
      'a missing story file',
      'src/shared/components/NoStory/NoStory.tsx',
      'project-structure/folder-structure',
    ],
    ['an unknown folder', 'src/misc/thing.ts', 'project-structure/folder-structure'],
    [
      'a non-test file importing test-utils',
      'src/features/home/utils/usesTestUtils.ts',
      'boundaries/dependencies',
    ],
    ['a default export', 'src/shared/utils/defaultExport.ts', 'import-x/no-default-export'],
    [
      'a literal string in JSX',
      'src/features/home/components/Banner/Banner.tsx',
      'i18next/no-literal-string',
    ],
    ['an import cycle', 'src/shared/utils/cycleA.ts', 'import-x/no-cycle'],
    [
      'a boolean without prefix',
      'src/shared/utils/flag.ts',
      '@typescript-eslint/naming-convention',
    ],
    ['a missing JSDoc on a service export', 'src/services/http/noDocs.ts', 'jsdoc/require-jsdoc'],
    [
      'an inline style',
      'src/features/home/components/Inline/Inline.tsx',
      'react-native/no-inline-styles',
    ],
    ['a high-entropy secret', 'src/shared/utils/secret.ts', 'no-secrets/no-secrets'],
    ['getByTestId in a test', 'src/shared/utils/byTestId.test.ts', 'no-restricted-syntax'],
  ];

  it('covers at least 12 invalid cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  it.each(cases)('rejects %s (%s)', (_name, file, rule) => {
    expect(invalid[file], `${file} was not linted`).toBeDefined();
    expect(invalid[file]).toContain(rule);
  });
});
