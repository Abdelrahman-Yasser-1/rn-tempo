import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MarkerError, markerProblems, stripFeaturesFromText, stripFeaturesInProject } from '../src/lib/markers.ts';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/markers');
const read = (name: string) => readFile(path.join(fixtures, name), 'utf8');

describe('stripFeaturesFromText', () => {
  it('removes regions and single-line markers for slash comments, keeping other features', async () => {
    const out = stripFeaturesFromText(await read('module.ts'), ['ssl-pinning'], 'module.ts');
    expect(out).toBe("import { a } from './a';\nimport { keep } from './keep';\nexport const stay = 1;\n");
  });

  it('handles JSX, XML and hash comment styles', async () => {
    expect(stripFeaturesFromText(await read('Screen.tsx'), ['storybook'], 'Screen.tsx')).not.toContain('story');
    expect(stripFeaturesFromText(await read('AndroidManifest.xml'), ['device-integrity'], 'AndroidManifest.xml')).not.toContain('uses-permission');
    const pod = stripFeaturesFromText(await read('Podfile'), ['ssl-pinning'], 'Podfile');
    expect(pod).toContain("pod 'Keep'");
    expect(pod).not.toContain('Pin');
  });

  it('keeps markers of features that are not removed', async () => {
    const text = await read('module.ts');
    expect(stripFeaturesFromText(text, ['storybook'], 'module.ts')).toBe(text);
  });

  it('throws naming the file and line for an unclosed region', async () => {
    expect(() => stripFeaturesFromText('x\n// @tempo-feature:samples:start\n', ['samples'], 'src/a.ts')).toThrow(MarkerError);
    expect(markerProblems(await read('unbalanced.ts'), 'unbalanced.ts')).toEqual([
      'unbalanced.ts:2 region "samples" is never closed',
    ]);
  });

  it('reports nested regions and markers in JSON', async () => {
    expect(markerProblems(await read('nested.ts'), 'nested.ts')[0]).toMatch(/^nested\.ts:2 nested region/);
    expect(markerProblems('{ "a": "// @tempo-feature:samples:start" }', 'a.json')[0]).toMatch(/^a\.json:1 markers are not allowed in JSON/);
  });
});

describe('stripFeaturesInProject', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tempo-markers-'));
    await cp(fixtures, dir, { recursive: true });
    await rm(path.join(dir, 'unbalanced.ts'));
    await rm(path.join(dir, 'nested.ts'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rewrites only files that changed and skips unsupported types', async () => {
    await writeFile(path.join(dir, 'notes.md'), 'mentions @tempo-feature:samples:start in prose\n');
    const report = await stripFeaturesInProject(dir, ['ssl-pinning']);
    expect(report.changed.sort()).toEqual(['Podfile', 'module.ts']);
    expect(await readFile(path.join(dir, 'notes.md'), 'utf8')).toContain('prose');
  });

  it('collects every broken file before touching anything', async () => {
    await writeFile(path.join(dir, 'a.ts'), '// @tempo-feature:samples:start\n');
    await writeFile(path.join(dir, 'b.ts'), '// @tempo-feature:samples:end\n');
    const before = await readFile(path.join(dir, 'module.ts'), 'utf8');
    const error = await stripFeaturesInProject(dir, ['ssl-pinning']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MarkerError);
    expect((error as MarkerError).details).toHaveLength(2);
    expect(await readFile(path.join(dir, 'module.ts'), 'utf8')).toBe(before);
  });
});
