import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  addIcon,
  localNames,
  normalizeSvg,
  parseArgs,
  searchLocal,
  toKebabCase,
} from '../icons-add.mjs';

const TEMP_DIRS = [];

/** An icons folder with two icons, and a folder to take SVG files from. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'icons-add-test-'));
  TEMP_DIRS.push(root);
  const iconsDir = join(root, 'icons');
  mkdirSync(iconsDir);
  writeFileSync(join(iconsDir, 'arrow-left.svg'), '<svg viewBox="0 0 24 24"/>\n');
  writeFileSync(join(iconsDir, 'arrow-right.svg'), '<svg viewBox="0 0 24 24"/>\n');
  writeFileSync(join(iconsDir, 'LICENSE'), 'MIT');
  return { root, iconsDir, options: { iconsDir, fetchIcon: () => null } };
}

const MESSY_SVG = `<?xml version="1.0"?>
<!-- exported by a tool -->
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none">
  <path d="M1 1h2v2H1z" stroke="#123ABC" stroke-width="2"/>
</svg>`;

after(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('names', () => {
  it('makes kebab-case names', () => {
    assert.equal(toKebabCase('My Icon_2.svg'), 'my-icon-2');
    assert.equal(toKebabCase('ArrowLeft.SVG'), 'arrow-left');
    assert.equal(toKebabCase('--x--'), 'x');
  });

  it('lists the svg names sorted and searches them', () => {
    const { iconsDir } = fixture();

    assert.deepEqual(localNames(iconsDir), ['arrow-left', 'arrow-right']);
    assert.deepEqual(searchLocal('ARROW-L', iconsDir), ['arrow-left']);
    assert.deepEqual(searchLocal('nothing', iconsDir), []);
  });
});

describe('normalizeSvg', () => {
  it('strips the prolog and comments, tints the one color and drops the size', () => {
    const svg = normalizeSvg(MESSY_SVG);

    assert.doesNotMatch(svg, /<\?xml|<!--|width="48"|height="48"|#123ABC/i);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /fill="none"/);
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.ok(svg.endsWith('</svg>\n'));
  });

  it('keeps the size when there is no viewBox, and leaves several colors alone', () => {
    assert.match(
      normalizeSvg('<svg width="24" height="24"><path fill="#000"/></svg>'),
      /width="24"/,
    );
    assert.match(
      normalizeSvg('<svg viewBox="0 0 1 1"><path fill="#000"/><path fill="#fff"/></svg>'),
      /#000.*#fff/s,
    );
  });
});

describe('addIcon', () => {
  it('copies an svg file under its kebab-case name, normalized', () => {
    const { root, iconsDir, options } = fixture();
    const source = join(root, 'My Icon.svg');
    writeFileSync(source, MESSY_SVG);

    const { target, status } = addIcon({ input: source }, options);

    assert.equal(status, 'added');
    assert.equal(target, join(iconsDir, 'my-icon.svg'));
    assert.match(readFileSync(target, 'utf8'), /stroke="currentColor"/);
  });

  it('renames with --as and adds the -filled suffix', () => {
    const { root, iconsDir, options } = fixture();
    const source = join(root, 'x.svg');
    writeFileSync(source, MESSY_SVG);

    addIcon({ input: source, as: 'close' }, options);
    addIcon({ input: source, as: 'back', filled: true }, options);

    assert.ok(existsSync(join(iconsDir, 'close.svg')));
    assert.ok(existsSync(join(iconsDir, 'back-filled.svg')));
  });

  it('fetches a Tabler name that is not in the set, outline or filled', () => {
    const { iconsDir } = fixture();
    const calls = [];
    const fetchIcon = (name, style) => {
      calls.push(`${style}/${name}`);
      return '<svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor"><path d="M1 1"/></svg>';
    };

    addIcon({ input: 'heart' }, { iconsDir, fetchIcon });
    addIcon({ input: 'heart', filled: true }, { iconsDir, fetchIcon });

    assert.deepEqual(calls, ['outline/heart', 'filled/heart']);
    assert.ok(existsSync(join(iconsDir, 'heart.svg')));
    assert.ok(existsSync(join(iconsDir, 'heart-filled.svg')));
    assert.doesNotMatch(readFileSync(join(iconsDir, 'heart.svg'), 'utf8'), /width=/);
  });

  it('does not fetch a name that is already in the set', () => {
    const { iconsDir } = fixture();
    const fetchIcon = () => assert.fail('must not fetch');

    assert.equal(addIcon({ input: 'arrow-left' }, { iconsDir, fetchIcon }).status, 'present');
  });

  it('explains an unknown Tabler name, a missing file and a bad name', () => {
    const { root, options } = fixture();
    writeFileSync(join(root, 'notes.svg'), 'no markup here');

    assert.throws(() => addIcon({ input: 'nope' }, options), /has no outline icon named "nope"/);
    assert.throws(() => addIcon({ input: join(root, 'gone.svg') }, options), /No such file/);
    assert.throws(() => addIcon({ input: join(root, 'notes.svg') }, options), /not an SVG file/);
    assert.throws(() => addIcon({ input: 'heart', as: '___' }, options), /kebab-case/);
  });

  it('refuses to overwrite an icon when a name is forced', () => {
    const { root, options } = fixture();
    const source = join(root, 'x.svg');
    writeFileSync(source, MESSY_SVG);

    assert.throws(() => addIcon({ input: source, as: 'arrow-left' }, options), /already exists/);
  });
});

describe('parseArgs', () => {
  it('reads the input and the options', () => {
    assert.deepEqual(parseArgs(['x', '--filled', '--as', 'close']), {
      input: 'x',
      filled: true,
      remote: false,
      search: false,
      as: 'close',
    });
    assert.deepEqual(parseArgs(['--search', 'arrow', '--remote']), {
      input: 'arrow',
      filled: false,
      remote: true,
      search: true,
    });
  });

  it('rejects unknown options, a missing value and extra names', () => {
    assert.throws(() => parseArgs(['x', '--nope']), /Unknown option --nope/);
    assert.throws(() => parseArgs(['x', '--as']), /--as needs a value/);
    assert.throws(() => parseArgs(['x', 'y']), /Expected one icon/);
  });
});
