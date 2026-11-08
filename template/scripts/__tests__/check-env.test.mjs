import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareKeys,
  describeMismatches,
  findMismatches,
  isRootEnvTracked,
  parseEnvKeys,
} from '../check-env.mjs';

const EXAMPLE = '# header\nAPP_ENV=dev\n\n# a comment\nMAPS_KEY=\nAPI_URL=https://x.y/?a=b\n';

describe('parseEnvKeys', () => {
  it('reads KEY=value lines and skips blanks and comments', () => {
    assert.deepEqual([...parseEnvKeys(EXAMPLE)], ['APP_ENV', 'MAPS_KEY', 'API_URL']);
  });

  it('accepts export prefixes, CRLF and empty values', () => {
    assert.deepEqual([...parseEnvKeys('export A=1\r\nB=\r\n#C=3\r\n')], ['A', 'B']);
  });
});

describe('compareKeys', () => {
  it('lists missing and extra keys sorted', () => {
    assert.deepEqual(compareKeys(new Set(['A', 'B']), new Set(['B', 'Z', 'C'])), {
      missing: ['A'],
      extra: ['C', 'Z'],
    });
  });
});

describe('findMismatches', () => {
  it('passes files with the same key set, whatever the order and values', () => {
    const files = { '.env.example': EXAMPLE, '.env.dev': 'API_URL=1\nMAPS_KEY=k\nAPP_ENV=dev\n' };
    assert.deepEqual(findMismatches(files), {});
  });

  it('reports each differing file', () => {
    const files = {
      '.env.example': 'A=1\nB=2\n',
      '.env.dev': 'A=1\n',
      '.env.prod': 'A=1\nB=2\nC=3\n',
      '.env.staging': 'A=1\nB=2\n',
    };
    assert.deepEqual(findMismatches(files), {
      '.env.dev': { missing: ['B'], extra: [] },
      '.env.prod': { missing: [], extra: ['C'] },
    });
  });

  it('fails when .env.example is missing', () => {
    assert.equal(findMismatches({ '.env.dev': 'A=1' })['.env.example'].absent, true);
  });
});

describe('describeMismatches', () => {
  it('names the file and both key lists', () => {
    const lines = describeMismatches({ '.env.dev': { missing: ['B'], extra: ['C'] } });
    assert.deepEqual(lines, ['.env.dev differs from .env.example:', '  missing: B', '  extra: C']);
  });
});

describe('isRootEnvTracked', () => {
  it('is true only when git lists .env', () => {
    assert.equal(
      isRootEnvTracked('.', () => ({ status: 0, stdout: '.env\n' })),
      true,
    );
    assert.equal(
      isRootEnvTracked('.', () => ({ status: 0, stdout: '' })),
      false,
    );
  });

  it('is false outside a git repo', () => {
    assert.equal(
      isRootEnvTracked('.', () => ({ status: 128, stdout: '' })),
      false,
    );
  });
});
