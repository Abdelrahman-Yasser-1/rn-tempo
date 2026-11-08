import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlan } from '../fresh-install.mjs';

const summary = (plan) =>
  plan.map((step) =>
    step.kind === 'remove' ? `rm ${step.path}` : [step.command, ...step.args].join(' '),
  );

describe('buildPlan', () => {
  it('cleans caches, removes node_modules, installs, then installs pods on macOS', () => {
    assert.deepEqual(summary(buildPlan({ platform: 'darwin', hasTempo: true })), [
      'yarn tempo clean --yes --skip-pods',
      'rm node_modules',
      'yarn install',
      'yarn pods',
    ]);
  });

  it('skips pods off macOS', () => {
    assert.deepEqual(
      summary(buildPlan({ platform: 'linux', hasTempo: true })).at(-1),
      'yarn install',
    );
  });

  it('skips tempo clean when the CLI is not installed', () => {
    assert.deepEqual(summary(buildPlan({ platform: 'linux', hasTempo: false })), [
      'rm node_modules',
      'yarn install',
    ]);
  });
});
