import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';

import { createConfig } from '../index.mjs';
import { dependencyOwner } from '../plugin/dependency-owner.mjs';
import { oneComponentPerFile } from '../plugin/one-component-per-file.mjs';
import { restrictedSyntax } from '../plugin/restricted-syntax.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const file = (relative) => path.resolve(relative);
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const SELECTOR = "ImportDeclaration[source.value='left-pad']";
const scoped = {
  selector: SELECTOR,
  message: 'scoped message',
  files: ['src/**'],
  ignores: ['src/ok/**'],
};

tester.run('rn-tempo/restricted-syntax', restrictedSyntax, {
  valid: [
    { code: "import 'left-pad';", filename: file('scripts/a.js'), options: [scoped] },
    { code: "import 'left-pad';", filename: file('src/ok/a.js'), options: [scoped] },
    { code: "import 'other';", filename: file('src/a.js'), options: [scoped] },
    {
      code: "import 'left-pad';",
      filename: file('.hidden/a.js'),
      options: [{ ...scoped, files: ['src/**'] }],
    },
  ],
  invalid: [
    {
      code: "import 'left-pad';",
      filename: file('src/a.js'),
      options: [scoped],
      errors: [{ message: 'scoped message' }],
    },
    {
      // No `files`: every linted file.
      code: "import 'left-pad';",
      filename: file('scripts/a.js'),
      options: [{ selector: SELECTOR, message: 'everywhere' }],
      errors: [{ message: 'everywhere' }],
    },
    {
      // Dot folders are matched too.
      code: "import 'left-pad';",
      filename: file('.rnstorybook/a.js'),
      options: [{ selector: SELECTOR, message: 'dot', files: ['.rnstorybook/**'] }],
      errors: [{ message: 'dot' }],
    },
    {
      // Two entries with the same selector both report.
      code: "import 'left-pad';",
      filename: file('src/a.js'),
      options: [scoped, { selector: SELECTOR, message: 'second message' }],
      errors: [{ message: 'scoped message' }, { message: 'second message' }],
    },
  ],
});

const POLICY = {
  axios: { kind: 'owned', owners: ['src/services/http/**'], message: 'Use @services/http.' },
  '@scope/*': { kind: 'owned', owners: ['src/lib/**'], message: 'Scoped family.' },
  react: { kind: 'free', reason: 'Core.' },
  'nitro-thing': { kind: 'native', reason: 'No JS import.', owners: ['index.js'] },
};

tester.run('rn-tempo/dependency-owner', dependencyOwner, {
  valid: [
    {
      code: "import axios from 'axios';",
      filename: file('src/services/http/client.ts'),
      options: [POLICY],
    },
    { code: "import 'axios/lib/x';", filename: file('src/services/http/x.ts'), options: [POLICY] },
    { code: "import React from 'react';", filename: file('src/a.ts'), options: [POLICY] },
    { code: "import x from './axios';", filename: file('src/a.ts'), options: [POLICY] },
    { code: "import x from 'node:fs';", filename: file('src/a.ts'), options: [POLICY] },
    { code: "import x from 'unlisted';", filename: file('src/a.ts'), options: [POLICY] },
    { code: "import axios from 'axios';", filename: file('src/a.test.ts'), options: [POLICY] },
    {
      code: "import axios from 'axios';",
      filename: file('src/test-utils/a.ts'),
      options: [POLICY],
    },
    {
      code: "import axios from 'axios';",
      filename: file('src/a/__mocks__/axios.ts'),
      options: [POLICY],
    },
    { code: "jest.mock('axios');", filename: file('src/a.ts'), options: [POLICY] },
    { code: "import 'nitro-thing';", filename: file('index.js'), options: [POLICY] },
  ],
  invalid: [
    {
      code: "import axios from 'axios';",
      filename: file('src/features/a.ts'),
      options: [POLICY],
      errors: [{ message: /Use @services\/http\..*Allowed only in: src\/services\/http\/\*\*/ }],
    },
    {
      code: "export { get } from 'axios/lib/get';",
      filename: file('src/a.ts'),
      options: [POLICY],
      errors: [{ message: /axios/ }],
    },
    {
      code: "export * from 'axios';",
      filename: file('src/a.ts'),
      options: [POLICY],
      errors: [{ message: /axios/ }],
    },
    {
      code: "const x = await import('axios'); const y = require('axios');",
      filename: file('src/a.ts'),
      options: [POLICY],
      errors: [{ message: /axios/ }, { message: /axios/ }],
    },
    {
      code: "import x from '@scope/pkg/deep';",
      filename: file('src/a.ts'),
      options: [POLICY],
      errors: [{ message: /'@scope\/pkg'.*Scoped family/ }],
    },
    {
      code: "import 'nitro-thing';",
      filename: file('src/a.ts'),
      options: [POLICY],
      errors: [{ message: /No JS import/ }],
    },
  ],
});

tester.run('rn-tempo/one-component-per-file', oneComponentPerFile, {
  valid: [
    { code: 'export function A() { return <div />; }\nexport const useThing = () => 1;' },
    { code: 'const helper = () => <div />;\nexport const A = () => helper();' },
    {
      code: 'export const A = () => <div />;\nfunction notJsx() { return 1; }\nconst Config = { a: 1 };',
    },
  ],
  invalid: [
    {
      code: 'export function A() { return <div />; }\nfunction B() { return <span />; }',
      errors: [{ message: /'B' is a second component/ }],
    },
    {
      code: 'export const A = () => <div />;\nexport const B = memo(() => <span />);\nconst C = function () { return <i />; };',
      errors: [{ message: /'B'/ }, { message: /'C'/ }],
    },
  ],
});

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'valid');

describe('createConfig', () => {
  it('sets each restriction rule in at most one config block', () => {
    const config = createConfig({ root, structure: true });
    const rules = [
      'no-restricted-syntax',
      'no-restricted-imports',
      'rn-tempo/restricted-syntax',
      'rn-tempo/discouraged-syntax',
    ];
    for (const rule of rules) {
      const blocks = config.filter((block) => block.rules && rule in block.rules);
      expect(
        blocks.length,
        `${rule} is set in ${blocks.map((block) => block.name).join(', ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('does not set the core restriction rules at all', () => {
    const config = createConfig({ root, structure: true });
    for (const rule of ['no-restricted-syntax', 'no-restricted-imports']) {
      expect(config.filter((block) => block.rules && rule in block.rules)).toEqual([]);
    }
  });
});
