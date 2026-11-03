import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { addIcon, catalogueNames, parseArgs, searchIcons } from '../icons-add.mjs';

const TEMP_DIRS = [];

/** A catalogue with a few outline and filled icons, and an empty icons folder. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'icons-add-test-'));
  TEMP_DIRS.push(root);
  const catalogueDir = join(root, 'catalogue');
  const iconsDir = join(root, 'icons');
  mkdirSync(join(catalogueDir, 'outline'), { recursive: true });
  mkdirSync(join(catalogueDir, 'filled'), { recursive: true });
  mkdirSync(iconsDir);
  for (const name of ['arrow-left', 'arrow-right', 'x']) {
    writeFileSync(join(catalogueDir, 'outline', `${name}.svg`), `<svg>${name}</svg>\n`);
  }
  writeFileSync(join(catalogueDir, 'filled', 'arrow-left.svg'), '<svg>filled</svg>\n');
  writeFileSync(join(catalogueDir, 'outline', 'notes.txt'), 'ignored');
  return { catalogueDir, iconsDir, options: { catalogueDir, iconsDir } };
}

after(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('catalogue', () => {
  it('lists svg names sorted, and searches both styles', () => {
    const { catalogueDir } = fixture();

    assert.deepEqual(catalogueNames('outline', catalogueDir), ['arrow-left', 'arrow-right', 'x']);
    assert.deepEqual(searchIcons('ARROW-L', catalogueDir), [
      { style: 'outline', name: 'arrow-left' },
      { style: 'filled', name: 'arrow-left' },
    ]);
    assert.deepEqual(searchIcons('nothing', catalogueDir), []);
  });
});

describe('addIcon', () => {
  it('copies an outline icon under its own name', () => {
    const { iconsDir, options } = fixture();

    const target = addIcon({ name: 'arrow-left' }, options);

    assert.equal(target, join(iconsDir, 'arrow-left.svg'));
    assert.equal(readFileSync(target, 'utf8'), '<svg>arrow-left</svg>\n');
  });

  it('adds the -filled suffix for filled icons, after --as', () => {
    const { iconsDir, options } = fixture();

    addIcon({ name: 'arrow-left', filled: true }, options);
    addIcon({ name: 'x', as: 'close' }, options);
    addIcon({ name: 'arrow-left', filled: true, as: 'back' }, options);

    assert.equal(
      readFileSync(join(iconsDir, 'arrow-left-filled.svg'), 'utf8'),
      '<svg>filled</svg>\n',
    );
    assert.ok(existsSync(join(iconsDir, 'close.svg')));
    assert.ok(existsSync(join(iconsDir, 'back-filled.svg')));
  });

  it('suggests similar names for an unknown icon', () => {
    const { options } = fixture();

    assert.throws(
      () => addIcon({ name: 'arrow' }, options),
      /No outline icon named "arrow" in the catalogue\. Did you mean: arrow-left, arrow-right\?/,
    );
    assert.throws(() => addIcon({ name: 'x', filled: true }, options), /No filled icon named "x"/);
  });

  it('refuses a bad target name and an existing icon', () => {
    const { options } = fixture();

    assert.throws(() => addIcon({ name: 'x', as: 'Close_Icon' }, options), /not a kebab-case name/);
    addIcon({ name: 'x' }, options);
    assert.throws(() => addIcon({ name: 'x' }, options), /already exists/);
  });
});

describe('parseArgs', () => {
  it('reads the name, --filled, --as and --search', () => {
    assert.deepEqual(parseArgs(['x', '--filled', '--as', 'close']), {
      name: 'x',
      filled: true,
      as: 'close',
    });
    assert.deepEqual(parseArgs(['--search', 'arrow']), {
      name: undefined,
      filled: false,
      search: 'arrow',
    });
  });

  it('rejects unknown options, a missing value and extra names', () => {
    assert.throws(() => parseArgs(['x', '--nope']), /Unknown option --nope/);
    assert.throws(() => parseArgs(['x', '--as']), /--as needs a value/);
    assert.throws(() => parseArgs(['x', 'y']), /Expected one icon name/);
  });
});
