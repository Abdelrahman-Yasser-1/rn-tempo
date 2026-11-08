import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { parseArgs, ribbonSvg, withBadge } from '../native/icons.mjs';

const BOX = { x: 0, y: 0, width: 1024, height: 1024 };
const DEV = { text: 'DEV', color: '#F97316' };
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

describe('icon label rendering', () => {
  it('draws the same label to the same bytes every time', async () => {
    const first = await withBadge('app-icon.png', BOX, DEV, 0, '1.2.3 (45)');
    const second = await withBadge('app-icon.png', BOX, DEV, 0, '1.2.3 (45)');
    assert.equal(sha(first), sha(second));
  });

  it('changes the icon when a label is given, and with the label text', async () => {
    const plain = await withBadge('app-icon.png', BOX, DEV, 0);
    const one = await withBadge('app-icon.png', BOX, DEV, 0, '1.2.3 (45)');
    const two = await withBadge('app-icon.png', BOX, DEV, 0, '1.2.3 (46)');
    assert.notEqual(sha(one), sha(plain));
    assert.notEqual(sha(one), sha(two));
  });

  it('never labels an icon without a badge (prod)', async () => {
    const plain = await withBadge('app-icon.png', BOX, null, 0);
    const labelled = await withBadge('app-icon.png', BOX, null, 0, '1.2.3 (45)');
    assert.equal(sha(labelled), sha(plain));
  });

  it('is byte-identical to the plain icon when the label is empty', () => {
    assert.equal(
      ribbonSvg(1024, BOX, DEV, 0).toString(),
      ribbonSvg(1024, BOX, DEV, 0, '').toString(),
    );
  });

  it('draws only capitals, so a lowercase label is shown as capitals', () => {
    assert.equal(
      ribbonSvg(1024, BOX, DEV, 0, '1.0.0-rc.1 (2)').toString(),
      ribbonSvg(1024, BOX, DEV, 0, '1.0.0-RC.1 (2)').toString(),
    );
  });

  it('keeps a long label inside the icon width', () => {
    const svg = ribbonSvg(1024, BOX, DEV, 0, '12.345.678-RC.10 (123456789)').toString();
    const xs = [...svg.matchAll(/translate\(([\d.]+) /g)].map((match) => Number(match[1]));
    assert.ok(Math.min(...xs) >= 0);
    assert.ok(Math.max(...xs) <= 1024);
  });

  it('refuses characters it has no glyph for', () => {
    assert.throws(() => ribbonSvg(1024, BOX, DEV, 0, '1.0 @'), /no glyph for "@"/);
  });
});

describe('icons.mjs arguments', () => {
  it('reads --label and --env', () => {
    assert.deepEqual(parseArgs(['--label', '1.0.0 (7)', '--env', 'dev']), {
      label: '1.0.0 (7)',
      env: 'dev',
    });
  });

  it('defaults to no label and every env', () => {
    assert.deepEqual(parseArgs([]), { label: '', env: undefined });
  });

  it('rejects unknown options and missing values', () => {
    assert.throws(() => parseArgs(['--colour', 'red']), /unknown option/);
    assert.throws(() => parseArgs(['--label']), /needs a value/);
    assert.throws(() => parseArgs(['--label', '--env', 'dev']), /needs a value/);
  });
});
