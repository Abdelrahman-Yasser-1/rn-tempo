import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { FEATURE_NAMES, commentStylesFor, schemas, scanMarkers, stripFeature, validateMarkers } from '../index.mjs';
import { parseSession } from '../../../template/scripts/ai-log/lib.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const template = path.join(repo, 'template');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schemas.featureManifest, 'feature-manifest.schema.json');
const validateManifest = ajv.getSchema('feature-manifest.schema.json');
const validateTempo = ajv.compile(schemas.tempo);
const validateSession = ajv.compile(schemas.aiSession);

describe('feature manifests', () => {
  const dir = path.join(template, '.tempo/features');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('exist for every feature name', () => {
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual([...FEATURE_NAMES].sort());
  });

  it.each(files)('%s is valid and named after its file', (file) => {
    const manifest = readJson(path.join(dir, file));
    expect(validateManifest(manifest), JSON.stringify(validateManifest.errors)).toBe(true);
    expect(manifest.name).toBe(file.replace('.json', ''));
  });

  it('rejects unknown fields and absolute globs', () => {
    const bad = { ...readJson(path.join(dir, 'samples.json')), extra: true, deleteGlobs: ['/etc/**'] };
    expect(validateManifest(bad)).toBe(false);
  });
});

describe('.tempo.json', () => {
  it('template metadata is valid', () => {
    const tempo = readJson(path.join(template, '.tempo.json'));
    expect(validateTempo(tempo), JSON.stringify(validateTempo.errors)).toBe(true);
  });

  it('rejects a bad bundle id', () => {
    const tempo = readJson(path.join(template, '.tempo.json'));
    expect(validateTempo({ ...tempo, app: { ...tempo.app, bundleId: 'Com.Bad' } })).toBe(false);
  });
});

describe('AI session logs', () => {
  const dir = path.join(repo, '.ai/sessions');
  // Session logs are local only (gitignored), so the directory usually does not exist in CI.
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];

  if (files.length === 0) it.skip('local session logs match the schema (none present)', () => {});
  else
    it.each(files)('%s frontmatter matches the schema', (file) => {
      const { meta } = parseSession(readFileSync(path.join(dir, file), 'utf8'));
      expect(validateSession(meta), JSON.stringify(validateSession.errors)).toBe(true);
    });
});

describe('markers', () => {
  const source = [
    "import a from 'a';",
    '// @tempo-feature:ssl-pinning:start',
    "import pin from 'pin';",
    '// @tempo-feature:ssl-pinning:end',
    "setup(); // @tempo-feature:ssl-pinning",
    'keep();',
  ].join('\n');

  it('scans markers with kinds and lines', () => {
    expect(scanMarkers(source)).toEqual([
      { name: 'ssl-pinning', kind: 'start', line: 2 },
      { name: 'ssl-pinning', kind: 'end', line: 4 },
      { name: 'ssl-pinning', kind: 'single', line: 5 },
    ]);
  });

  it('strips a feature region and single-line markers', () => {
    expect(stripFeature(source, 'ssl-pinning')).toBe("import a from 'a';\nkeep();");
  });

  it('keeps other features untouched', () => {
    expect(stripFeature(source, 'storybook')).toBe(source);
  });

  it('strips JSX and XML regions', () => {
    const jsx = '<A />\n{/* @tempo-feature:storybook:start */}\n<B />\n{/* @tempo-feature:storybook:end */}';
    expect(stripFeature(jsx, 'storybook')).toBe('<A />');
    const xml = '<a/>\n<!-- @tempo-feature:maestro:start -->\n<b/>\n<!-- @tempo-feature:maestro:end -->';
    expect(stripFeature(xml, 'maestro')).toBe('<a/>');
  });

  it('reports unbalanced, nested and unknown markers', () => {
    expect(validateMarkers('// @tempo-feature:samples:start')).toHaveLength(1);
    expect(validateMarkers('// @tempo-feature:samples:end')).toHaveLength(1);
    expect(validateMarkers('// @tempo-feature:nope')).toHaveLength(1);
    const nested = '// @tempo-feature:samples:start\n// @tempo-feature:storybook:start\n// @tempo-feature:storybook:end\n// @tempo-feature:samples:end';
    expect(validateMarkers(nested).some((p) => p.includes('nested'))).toBe(true);
    expect(() => stripFeature('// @tempo-feature:samples:start', 'samples')).toThrow(/never closed/);
  });

  it('maps file types to comment styles', () => {
    expect(commentStylesFor('src/a.ts')).toEqual(['slash']);
    expect(commentStylesFor('src/A.tsx')).toEqual(['slash', 'jsx']);
    expect(commentStylesFor('ios/Info.plist')).toEqual(['xml']);
    expect(commentStylesFor('ios/Podfile')).toEqual(['hash']);
    expect(commentStylesFor('.env.dev')).toEqual(['hash']);
    expect(commentStylesFor('package.json')).toEqual([]);
  });

  it('template sources contain only valid markers', () => {
    const navTypes = readFileSync(path.join(template, 'src/navigation/types.ts'), 'utf8');
    expect(validateMarkers(navTypes, 'src/navigation/types.ts')).toEqual([]);
  });
});
