import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatDuration,
  needsFullRun,
  parseArgs,
  planSteps,
  renderReport,
} from '../verify-changed.mjs';

describe('needsFullRun', () => {
  it('is true for every config file', () => {
    for (const file of [
      'package.json',
      'yarn.lock',
      '.yarnrc.yml',
      'tsconfig.json',
      'babel.config.js',
      'babel/plugin.js',
      'metro.config.js',
      'jest.config.js',
      'jest.setup.ts',
      '__mocks__/react-native.ts',
      'eslint.config.mjs',
      'prettier.config.mjs',
      '.ls-lint.yml',
      'knip.json',
      'i18next.config.ts',
      '.env.example',
    ]) {
      assert.equal(needsFullRun(['src/a.ts', file]), true, file);
    }
  });

  it('is false for source, docs and nested files with a config name', () => {
    assert.equal(
      needsFullRun([
        'src/a.ts',
        'README.md',
        'src/package.json',
        'scripts/babel.config.js',
        '.env.dev',
      ]),
      false,
    );
    assert.equal(needsFullRun([]), false);
  });
});

describe('parseArgs', () => {
  it('reads --pr and --out', () => {
    assert.deepEqual(parseArgs([]), { pr: false, out: undefined });
    assert.deepEqual(parseArgs(['--pr', '--out', 'r.md']), { pr: true, out: 'r.md' });
  });
});

describe('planSteps', () => {
  it('runs eslint, prettier and jest only for matching files', () => {
    const labels = (files) => planSteps(files).map((step) => step.label);
    assert.deepEqual(labels(['src/a.ts', 'README.md']), [
      'eslint',
      'prettier',
      'ls-lint',
      'tsc',
      'jest',
    ]);
    assert.deepEqual(labels(['README.md']), ['prettier', 'ls-lint', 'tsc']);
    assert.deepEqual(labels(['logo.png']), ['ls-lint', 'tsc']);
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    assert.equal(formatDuration(1234), '1.2s');
    assert.equal(formatDuration(184_000), '3m 04s');
  });
});

describe('renderReport', () => {
  it('lists steps and the last 40 lines of failures', () => {
    const output = Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n');
    const report = renderReport([
      { label: 'eslint', ok: true, durationMs: 2000, output: '' },
      { label: 'tsc', ok: false, durationMs: 5000, output },
    ]);
    assert.match(report, /\| eslint \| ✅ \| 2\.0s \|/);
    assert.match(report, /\| tsc \| ❌ \| 5\.0s \|/);
    assert.match(report, /<details><summary>tsc failed<\/summary>/);
    assert.ok(report.includes('line 60'));
    assert.ok(report.includes('line 21'));
    assert.ok(!report.includes('line 20\n'));
  });

  it('has no details block when everything passed', () => {
    assert.ok(
      !renderReport([{ label: 'tsc', ok: true, durationMs: 1, output: '' }]).includes('<details>'),
    );
  });
});
