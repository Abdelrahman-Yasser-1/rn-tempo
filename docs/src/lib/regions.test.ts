import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRegion, languageFor, parseHighlight, readRepoCode } from './regions';

const SOURCE = [
  'import a from "a";',
  '// #region boot',
  'const one = 1;',
  '  // #region inner',
  '  const two = 2;',
  '  // #endregion inner',
  'const three = 3;',
  '// #endregion boot',
  'export {};',
].join('\n');

describe('extractRegion', () => {
  it('returns only the lines of the region and hides nested markers', () => {
    expect(extractRegion(SOURCE, 'boot', 'x.ts')).toBe(
      ['const one = 1;', '  const two = 2;', 'const three = 3;'].join('\n'),
    );
  });

  it('extracts a nested region and removes the shared indentation', () => {
    expect(extractRegion(SOURCE, 'inner', 'x.ts')).toBe('const two = 2;');
  });

  it('supports #, <!-- --> and {/* */} marker syntaxes', () => {
    expect(extractRegion('# #region a\nfoo: 1\n# #endregion a', 'a', 'x.yml')).toBe('foo: 1');
    expect(extractRegion('<!-- #region a -->\n<a/>\n<!-- #endregion a -->', 'a', 'x.xml')).toBe(
      '<a/>',
    );
    expect(extractRegion('{/* #region a */}\n<A />\n{/* #endregion a */}', 'a', 'x.tsx')).toBe(
      '<A />',
    );
  });

  it('throws when the region is missing', () => {
    expect(() => extractRegion(SOURCE, 'nope', 'x.ts')).toThrow('Region "nope" not found in x.ts');
  });

  it('throws when the region is not closed', () => {
    expect(() => extractRegion('// #region a\ncode', 'a', 'x.ts')).toThrow('no matching #endregion');
  });

  it('throws when the region is defined twice or empty', () => {
    const twice = '// #region a\nx\n// #endregion a\n// #region a\ny\n// #endregion a';
    expect(() => extractRegion(twice, 'a', 'x.ts')).toThrow('more than once');
    expect(() => extractRegion('// #region a\n// #endregion a', 'a', 'x.ts')).toThrow('empty');
  });
});

describe('readRepoCode', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'docs-regions-'));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'a.ts'), SOURCE + '\n');

  it('reads a whole file or a region relative to the repo root', () => {
    expect(readRepoCode('src/a.ts', undefined, root)).toBe(SOURCE);
    expect(readRepoCode('src/a.ts', 'inner', root)).toBe('const two = 2;');
  });

  it('throws on a missing file or a path outside the root', () => {
    expect(() => readRepoCode('src/missing.ts', undefined, root)).toThrow('cannot read');
    expect(() => readRepoCode('../etc/passwd', undefined, root)).toThrow('outside the repo root');
  });
});

describe('parseHighlight', () => {
  it('parses lists and ranges', () => {
    expect([...parseHighlight('1,3-5')]).toEqual([1, 3, 4, 5]);
    expect([...parseHighlight([2])]).toEqual([2]);
    expect(parseHighlight(undefined).size).toBe(0);
  });

  it('throws on garbage', () => {
    expect(() => parseHighlight('a')).toThrow('Invalid highlight');
  });
});

describe('languageFor', () => {
  it('maps extensions and special files', () => {
    expect(languageFor('a/b.tsx')).toBe('tsx');
    expect(languageFor('ios/Podfile')).toBe('ruby');
    expect(languageFor('x.unknown')).toBe('text');
  });
});
