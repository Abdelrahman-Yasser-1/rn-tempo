import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

import { checkAssets, findAssetProblems, generateAssets, svgColors } from '../assets.mjs';

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));
const TEMP_DIRS = [];

/** A PNG header for the given size. `seed` keeps same-sized images from being identical. */
function png(width, height, seed = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const type = Buffer.from('IHDR');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, ihdr])));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, length, type, ihdr, crc, Buffer.from([seed])]);
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>\n`;

const VALID_SOURCES = {
  'README.md': '# Assets\n',
  'icons/cart-full.svg': svg('<path fill="#1C1C1C" d="M2 2h20v20H2z"/>'),
  'icons/chevron-end.svg': svg('<path stroke="#000" fill="none" d="M9 6l6 6-6 6"/>'),
  'images/logo.png': png(10, 20),
  'images/logo@2x.png': png(20, 40),
  'images/logo@3x.png': png(30, 60),
  'fonts/.gitkeep': '',
  'animations/loader.json': '{}',
  'icons-source/app-icon.png': 'x',
};

/** Writes VALID_SOURCES with `changes` (null deletes) to a temp assets folder. */
function assetsDirWith(changes = {}) {
  const assetsDir = mkdtempSync(join(tmpdir(), 'assets-test-'));
  TEMP_DIRS.push(assetsDir);
  for (const [path, content] of Object.entries({ ...VALID_SOURCES, ...changes })) {
    if (content !== null) {
      mkdirSync(dirname(join(assetsDir, path)), { recursive: true });
      writeFileSync(join(assetsDir, path), content);
    }
  }
  return assetsDir;
}

after(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('asset sources', () => {
  it('accepts the repository, whose generated files are current', () => {
    const assetsDir = join(ROOT_DIR, 'src/assets');

    assert.deepEqual(findAssetProblems(assetsDir), []);
    assert.deepEqual(checkAssets(assetsDir, join(assetsDir, 'generated')), []);
  });

  it('accepts valid sources', () => {
    assert.deepEqual(findAssetProblems(assetsDirWith()), []);
  });

  it('requires kebab-case names that start with a letter', () => {
    assert.deepEqual(
      findAssetProblems(
        assetsDirWith({
          'icons/Cart_Full.svg': svg('<path d="M0 0h1v1H0z"/>'),
          'icons/1-up.svg': svg('<g/>'),
        }),
      ),
      [
        'icons/1-up.svg: names are kebab-case (for example cart-empty)',
        'icons/Cart_Full.svg: names are kebab-case (for example cart-empty)',
      ],
    );
  });

  it('rejects a name used in two registries, and the same file twice', () => {
    const problems = findAssetProblems(
      assetsDirWith({
        'images/cart-full.png': png(1, 1, 3),
        'images/cart-full@2x.png': png(2, 2, 4),
        'images/cart-full@3x.png': png(3, 3, 5),
        'icons/cart-copy.svg': VALID_SOURCES['icons/cart-full.svg'],
      }),
    );

    assert.deepEqual(problems, [
      'cart-full: the name is used in icons and images',
      'icons/cart-copy.svg, icons/cart-full.svg: the same file more than once',
    ]);
  });

  it('rejects density suffixes on icons', () => {
    assert.deepEqual(findAssetProblems(assetsDirWith({ 'icons/bell@2x.svg': svg('<g/>') })), [
      'icons/bell@2x.svg: only images/ has density variants',
    ]);
  });

  it('requires 1x, 2x and 3x images in a 1:2:3 ratio', () => {
    assert.deepEqual(
      findAssetProblems(
        assetsDirWith({ 'images/logo@2x.png': png(21, 40), 'images/logo@3x.png': null }),
      ),
      [
        'images/logo: add logo@3x.png (every image has 1x, 2x and 3x)',
        'images/logo@2x.png: is 21x40, expected 20x40 (2 times logo.png)',
      ],
    );
  });

  it('rejects SVG features react-native-svg does not render, and a missing viewBox', () => {
    assert.deepEqual(
      findAssetProblems(
        assetsDirWith({
          'icons/styled.svg': svg('<style>.a{fill:red}</style><filter id="f"/><path class="a"/>'),
          'icons/no-view-box.svg':
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"/>\n',
        }),
      ),
      [
        'icons/no-view-box.svg: add a viewBox, so the asset scales',
        'icons/styled.svg: react-native-svg does not render <style>, <filter>',
      ],
    );
  });

  it('keeps icons to one color, without gradients', () => {
    const message = 'icons have one color, so the color prop can tint them';

    assert.deepEqual(
      findAssetProblems(
        assetsDirWith({
          'icons/two-colors.svg': svg('<path fill="#000"/><path fill="#fff"/>'),
          'icons/gradient.svg': svg('<linearGradient id="g"/><path fill="url(#g)"/>'),
        }),
      ),
      [`icons/gradient.svg: ${message}`, `icons/two-colors.svg: ${message}`],
    );
  });

  it('finds paint colors, treating #abc as #aabbcc', () => {
    assert.deepEqual(
      svgColors(
        '<path fill="#ABC" stroke="#aabbcc" style="fill:rgb(1, 2, 3)"/><path fill="none" stroke="currentColor"/>',
      ),
      ['#aabbcc', 'rgb(1, 2, 3)'],
    );
  });

  it('rejects stray files, unknown folders and the wrong file types', () => {
    assert.deepEqual(
      findAssetProblems(
        assetsDirWith({
          'notes.txt': 'x',
          'videos/intro.mp4': 'x',
          'illustrations/empty.svg': svg('<g/>'),
          'icons/cart.png': png(1, 1, 1),
          'images/nested/banner.png': png(1, 1, 2),
        }),
      ),
      [
        'illustrations/: unknown asset folder',
        'notes.txt: put assets in icons/ or images/',
        'videos/: unknown asset folder',
        'icons/cart.png: icons/ holds flat .svg files only',
        'images/nested/banner.png: images/ holds flat .png files only',
      ],
    );
  });
});

describe('generated registries', () => {
  it('generates components and typed registries, and reports when they are stale', () => {
    const assetsDir = assetsDirWith();
    const generatedDir = join(assetsDir, 'generated');
    const read = (file) => readFileSync(join(generatedDir, file), 'utf8');

    assert.deepEqual(generateAssets(assetsDir, generatedDir), {
      icons: 2,
      images: 1,
    });
    assert.match(read('icons.registry.ts'), /'cart-full': CartFull,/);
    assert.match(
      read('icons.types.ts'),
      /export type IconName =\n {2}\| 'cart-full'\n {2}\| 'chevron-end';/,
    );
    assert.match(read('icons/CartFull.tsx'), /fill="currentColor"/);
    assert.match(read('icons/CartFull.tsx'), /viewBox="0 0 24 24"/);
    assert.doesNotMatch(read('icons/CartFull.tsx'), /xmlns|width=|height=/);
    assert.match(read('icons/ChevronEnd.tsx'), /stroke="currentColor"/);
    const header = /^\/\/ Generated by `yarn assets` from src\/assets\. Do not edit\.\n/;
    assert.match(read('icons/CartFull.tsx'), header);
    assert.match(read('icons.registry.ts'), header);
    assert.match(read('images.registry.ts'), /logo: require\('\.\.\/images\/logo\.png'\),/);
    assert.match(read('images.types.ts'), /export type ImageName =\n {2}\| 'logo';/);
    assert.deepEqual(checkAssets(assetsDir, generatedDir), []);

    writeFileSync(join(assetsDir, 'icons/bell.svg'), svg('<path fill="#000" d="M1 1h2v2H1z"/>'));
    writeFileSync(join(generatedDir, 'images.types.ts'), 'edited\n');
    writeFileSync(join(generatedDir, 'unused.ts'), 'export {};\n');
    assert.deepEqual(checkAssets(assetsDir, generatedDir), [
      'generated/icons/Bell.tsx is missing',
      'generated/unused.ts is stale',
      'generated/icons.registry.ts is out of date',
      'generated/icons.types.ts is out of date',
      'generated/images.types.ts is out of date',
    ]);
  });

  it('writes nothing when there are no assets, and refuses invalid sources', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'assets-empty-'));
    TEMP_DIRS.push(emptyDir);

    assert.deepEqual(generateAssets(emptyDir, join(emptyDir, 'generated')), {
      icons: 0,
      images: 0,
    });
    assert.deepEqual(checkAssets(emptyDir, join(emptyDir, 'generated')), []);
    assert.throws(
      () => generateAssets(assetsDirWith({ 'images/logo@3x.png': null }), join(emptyDir, 'out')),
      /Fix the asset sources first/,
    );
  });
});
