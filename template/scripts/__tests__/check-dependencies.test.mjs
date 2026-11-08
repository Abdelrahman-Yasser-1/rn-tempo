import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { describeUnclassified, findUnclassified } from '../check-dependencies.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const policy = {
  axios: { kind: 'owned', owners: ['src/services/http/**'], message: 'Use @services/http.' },
  '@scope/*': { kind: 'free', reason: 'A family.' },
};

describe('findUnclassified', () => {
  it('returns the packages without an entry, sorted', () => {
    assert.deepEqual(findUnclassified(['zod', 'axios', '@scope/a', 'left-pad'], policy), [
      'left-pad',
      'zod',
    ]);
  });

  it('returns nothing when every package is classified', () => {
    assert.deepEqual(findUnclassified(['axios', '@scope/b'], policy), []);
  });

  it('names the fix in the message', () => {
    const text = describeUnclassified(['left-pad']);
    assert.match(text, /left-pad/);
    assert.match(text, /eslint\.config\.mjs/);
  });
});

describe('yarn lint:deps', () => {
  it('passes for the current package.json', () => {
    const output = execFileSync(process.execPath, ['scripts/check-dependencies.mjs'], {
      cwd: root,
      encoding: 'utf8',
      // Fail instead of hanging verify if loading the ESLint config ever stalls.
      timeout: 120_000,
    });
    assert.equal(output, '');
  });
});
