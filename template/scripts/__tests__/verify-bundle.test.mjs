import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildArgs, formatSize, parseArgs } from '../verify-bundle.mjs';

describe('parseArgs', () => {
  it('bundles both platforms by default', () => {
    assert.deepEqual(parseArgs([]), { platforms: ['ios', 'android'], resetCache: false });
  });

  it('limits to one platform and passes --reset-cache', () => {
    assert.deepEqual(parseArgs(['--platform', 'android', '--reset-cache']), {
      platforms: ['android'],
      resetCache: true,
    });
  });

  it('rejects unknown platforms and arguments', () => {
    assert.throws(() => parseArgs(['--platform', 'web']), /--platform/);
    assert.throws(() => parseArgs(['--platform']), /--platform/);
    assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
  });
});

describe('buildArgs', () => {
  it('builds a production bundle command with source maps', () => {
    assert.deepEqual(buildArgs('ios', 'out', false), [
      'react-native',
      'bundle',
      '--platform',
      'ios',
      '--dev',
      'false',
      '--entry-file',
      'index.js',
      '--bundle-output',
      'out/ios.bundle',
      '--sourcemap-output',
      'out/ios.map',
    ]);
  });

  it('appends --reset-cache when asked', () => {
    assert.equal(buildArgs('android', 'out', true).at(-1), '--reset-cache');
  });
});

describe('formatSize', () => {
  it('uses KB below one megabyte and MB above', () => {
    assert.equal(formatSize(2048), '2.0 KB');
    assert.equal(formatSize(3 * 1024 * 1024), '3.00 MB');
  });
});
