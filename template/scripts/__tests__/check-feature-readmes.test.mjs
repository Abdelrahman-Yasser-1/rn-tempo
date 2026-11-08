import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  checkFeature,
  checkFeatures,
  parseExports,
  parsePublicApi,
} from '../check-feature-readmes.mjs';

const sorted = (set) => [...set].sort();

describe('parseExports', () => {
  it('reads named re-exports, aliases and inline type markers', () => {
    const source = `
      export { LoginScreen } from './screens/LoginScreen';
      export { useAuthStore, type AuthStatus } from './store/auth.store';
      export { a as b } from './a';
    `;
    assert.deepEqual(sorted(parseExports(source)), [
      'AuthStatus',
      'LoginScreen',
      'b',
      'useAuthStore',
    ]);
  });

  it('reads type-only and multi-line export lists', () => {
    const source = `export type { Item, Other } from './types';
export {
  One,
  Two,
} from './x';`;
    assert.deepEqual(sorted(parseExports(source)), ['Item', 'One', 'Other', 'Two']);
  });

  it('reads declarations', () => {
    const source = `export const KEY = 1;
export function useThing() {}
export type Shape = {};
export interface Props {}
export class Box {}`;
    assert.deepEqual(sorted(parseExports(source)), ['Box', 'KEY', 'Props', 'Shape', 'useThing']);
  });

  it('ignores commented-out exports', () => {
    const source = `// export { Old } from './old';
/* export { Older } from './older'; */
export { Kept } from './kept';`;
    assert.deepEqual(sorted(parseExports(source)), ['Kept']);
  });

  it('refuses export *', () => {
    assert.throws(() => parseExports("export * from './x';"), /export \*/);
  });
});

describe('parsePublicApi', () => {
  const readme = `# Auth

## Purpose

Sign in. Mentions \`NotAnExport\` in prose.

## Public API

Intro text with \`ignored\` words.

- \`LoginScreen\`: the screen
* \`useAuthStore\` store
- plain bullet

## Data

- \`authKeys\`
`;

  it('lists the first backticked word of each bullet of the section only', () => {
    assert.deepEqual(sorted(parsePublicApi(readme)), ['LoginScreen', 'useAuthStore']);
  });

  it('is undefined without the section', () => {
    assert.equal(parsePublicApi('# X\n\n## Purpose\n'), undefined);
  });
});

describe('checkFeature', () => {
  const indexSource = "export { A } from './a';\nexport type { B } from './b';\n";
  const readme = '## Public API\n\n- `A`\n- `B`\n';

  it('passes when the lists match', () => {
    assert.deepEqual(checkFeature({ name: 'x', indexSource, readme }), []);
  });

  it('reports a missing README, a missing section and a missing barrel', () => {
    assert.match(checkFeature({ name: 'x', indexSource })[0], /README\.md is missing/);
    assert.match(checkFeature({ name: 'x', indexSource, readme: '# X' })[0], /no "## Public API"/);
    assert.match(checkFeature({ name: 'x', readme })[0], /index\.ts is missing/);
  });

  it('reports exports that are not documented and documented names that are not exported', () => {
    const problems = checkFeature({
      name: 'x',
      indexSource: "export { A, C } from './a';",
      readme: '## Public API\n- `A`\n- `Gone`\n',
    });
    assert.deepEqual(problems, [
      'src/features/x/README.md: Public API is missing C.',
      'src/features/x/README.md: Public API lists Gone, which index.ts does not export.',
    ]);
  });
});

describe('checkFeatures', () => {
  it('scans every folder under src/features', () => {
    const root = mkdtempSync(join(tmpdir(), 'readmes-'));
    try {
      const ok = join(root, 'src/features/ok');
      const bad = join(root, 'src/features/bad');
      mkdirSync(ok, { recursive: true });
      mkdirSync(bad, { recursive: true });
      writeFileSync(join(ok, 'index.ts'), "export { A } from './a';");
      writeFileSync(join(ok, 'README.md'), '## Public API\n- `A`\n');
      writeFileSync(join(bad, 'index.ts'), "export { A } from './a';");

      assert.deepEqual(checkFeatures(root), ['src/features/bad/README.md is missing.']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes for a project without features', () => {
    assert.deepEqual(checkFeatures(join(tmpdir(), 'does-not-exist-readmes')), []);
  });
});
