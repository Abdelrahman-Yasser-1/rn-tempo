import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkNode, parseRange, satisfies } from '../check-node.mjs';

describe('parseRange', () => {
  it('supports >=x, >=x.y, >=x.y.z and a plain major', () => {
    assert.deepEqual(parseRange('>=24'), { exactMajor: false, min: [24, 0, 0] });
    assert.deepEqual(parseRange('>=24.3'), { exactMajor: false, min: [24, 3, 0] });
    assert.deepEqual(parseRange('>=24.3.0'), { exactMajor: false, min: [24, 3, 0] });
    assert.deepEqual(parseRange('24'), { exactMajor: true, min: [24, 0, 0] });
  });

  it('returns null for other forms', () => {
    for (const range of ['^24', '>=20 <26', '24.3.0', '24 || 26', '', undefined]) {
      assert.equal(parseRange(range), null, String(range));
    }
  });
});

describe('satisfies', () => {
  const range = parseRange('>=24.3.0');
  it('compares versions numerically', () => {
    assert.equal(satisfies('24.3.0', range), true);
    assert.equal(satisfies('24.2.9', range), false);
    assert.equal(satisfies('26.1.0', range), true);
    assert.equal(satisfies('v22.9.0', range), false);
    assert.equal(satisfies('24.10.0', range), true);
  });

  it('matches only the major for a plain version', () => {
    assert.equal(satisfies('24.9.1', parseRange('24')), true);
    assert.equal(satisfies('26.0.0', parseRange('24')), false);
  });
});

describe('checkNode', () => {
  it('passes Node 26 with only the .nvmrc warning', () => {
    const result = checkNode({ version: '26.0.0', range: '>=24.3.0', nvmrc: '24\n' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /\.nvmrc/);
  });

  it('fails with the range, the version and the fix', () => {
    const result = checkNode({ version: '22.1.0', range: '>=24.3.0', nvmrc: '24' });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], />=24\.3\.0/);
    assert.match(result.errors[0], /22\.1\.0/);
    assert.match(result.errors[0], /nvm use/);
  });

  it('warns and passes on an unsupported range', () => {
    const result = checkNode({ version: '22.1.0', range: '^24', nvmrc: undefined });
    assert.equal(result.ok, true);
    assert.match(result.warnings[0], /unsupported/);
  });

  it('does not warn when .nvmrc matches', () => {
    assert.deepEqual(checkNode({ version: '24.5.0', range: '>=24.3.0', nvmrc: '24' }).warnings, []);
  });
});
