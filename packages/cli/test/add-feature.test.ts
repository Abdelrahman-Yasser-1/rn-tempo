import { cp, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addFeature, insertRegions, restoreEnvKeys, restoreJsonPointer } from '../src/lib/add-feature.ts';
import { readTempoJson } from '../src/lib/tempo-json.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

const TEMPLATE_TS = `import a from 'a';
import items from '@locales/en/items.json'; // @tempo-feature:samples
import b from 'b';

export const routes = {
  Home: 1,
  // @tempo-feature:samples:start
  ItemsList: 2,
  ItemCreate: 3,
  // @tempo-feature:samples:end
  Profile: 4,
};
`;

const PROJECT_TS = `import a from 'a';
import b from 'b';

export const routes = {
  Home: 1,
  Profile: 4,
  Custom: 5,
};
`;

describe('insertRegions', () => {
  it('re-inserts regions and single-line markers at their anchored position', () => {
    const result = insertRegions(TEMPLATE_TS, PROJECT_TS, 'samples', 'routes.ts');
    expect(result.conflicts).toEqual([]);
    expect(result.inserted).toBe(2);
    expect(result.text).toBe(`import a from 'a';
import items from '@locales/en/items.json'; // @tempo-feature:samples
import b from 'b';

export const routes = {
  Home: 1,
  // @tempo-feature:samples:start
  ItemsList: 2,
  ItemCreate: 3,
  // @tempo-feature:samples:end
  Profile: 4,
  Custom: 5,
};
`);
  });

  it('tolerates lines the user added elsewhere and is idempotent', () => {
    const once = insertRegions(TEMPLATE_TS, PROJECT_TS, 'samples', 'routes.ts');
    const twice = insertRegions(TEMPLATE_TS, once.text, 'samples', 'routes.ts');
    expect(twice.inserted).toBe(0);
    expect(twice.text).toBe(once.text);
  });

  it('reports a conflict with the region text when the anchor is ambiguous', () => {
    const template = `x\n\n// @tempo-feature:samples:start\nfoo();\n// @tempo-feature:samples:end\n\ny\n`;
    const project = `x\n\ny\n\nx\n\ny\n`;
    const result = insertRegions(template, project, 'samples', 'a.ts');
    expect(result.inserted).toBe(0);
    expect(result.text).toBe(project);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reason).toMatch(/ambiguous/);
    expect(result.conflicts[0]?.region).toContain('foo();');
  });

  it('reports a conflict when the surrounding lines are gone', () => {
    const result = insertRegions(TEMPLATE_TS, 'completely different\n', 'samples', 'routes.ts');
    expect(result.inserted).toBe(0);
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts[0]?.reason).toMatch(/not found/);
  });
});

describe('restoreEnvKeys', () => {
  it('adds missing keys after their template predecessor and skips present ones', () => {
    const reference = 'A=1\nSSL_PINNING_ENABLED=false\nSSL_PINS=\nB=2\n';
    const result = restoreEnvKeys('A=1\nSSL_PINS=custom\nB=2\n', reference, ['SSL_PINNING_ENABLED', 'SSL_PINS']);
    expect(result.added).toEqual(['SSL_PINNING_ENABLED']);
    expect(result.text).toBe('A=1\nSSL_PINNING_ENABLED=false\nSSL_PINS=custom\nB=2\n');
  });

  it('appends when no predecessor exists', () => {
    expect(restoreEnvKeys('X=1\n', 'K=v\n', ['K']).text).toBe('X=1\nK=v\n');
  });
});

describe('restoreJsonPointer', () => {
  it('restores removed object keys in template order and reports problems', () => {
    const source = { scripts: { a: '1', storybook: '2', b: '3' } };
    const target = { scripts: { a: '1', b: '3' } };
    expect(restoreJsonPointer(target, source, '/scripts/storybook')).toBe('added');
    expect(Object.keys(target.scripts)).toEqual(['a', 'storybook', 'b']);
    expect(restoreJsonPointer(target, source, '/scripts/storybook')).toBe('present');
    expect(restoreJsonPointer(target, source, '/scripts/missing')).toMatch(/does not exist in the template/);
    expect(restoreJsonPointer({}, source, '/scripts/storybook')).toMatch(/parent/);
  });

  it('refuses pointers that reach the prototype chain', () => {
    const target = { scripts: {} };
    const source = JSON.parse('{"scripts":{},"__proto__":{"polluted":true}}') as unknown;
    expect(restoreJsonPointer(target, source, '/__proto__/polluted')).toMatch(/not an allowed/);
    expect(restoreJsonPointer(target, source, '/scripts/constructor')).toMatch(/not an allowed/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

/** Only the parts of the real template the ssl-pinning module touches; keeps these tests fast. */
const MINI_TEMPLATE_PATHS = [
  '.tempo',
  '.tempo.json',
  'package.json',
  '.env',
  '.env.dev',
  '.env.example',
  'src/services/security/pinning',
  'src/services/http/client.ts',
  'src/app/bootstrap/initSecurity.ts',
];

describe('addFeature (small project on a trimmed copy of the template)', () => {
  let dir = '';
  let cleanup = async () => {};
  let miniDir = '';
  let miniCleanup = async () => {};
  beforeAll(async () => {
    ({ dir: miniDir, cleanup: miniCleanup } = await makeTempDir('tempo-add-template'));
    for (const rel of MINI_TEMPLATE_PATHS) {
      await mkdir(path.dirname(path.join(miniDir, rel)), { recursive: true });
      await cp(path.join(TEMPLATE_DIR, rel), path.join(miniDir, rel), { recursive: true });
    }
  });
  afterAll(async () => miniCleanup());
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-add'));
    // A minimal "project": template manifests + .tempo.json without `dynamic-forms`' files.
    await cp(path.join(miniDir, '.tempo'), path.join(dir, '.tempo'), { recursive: true });
    const tempo = JSON.parse(await readFile(path.join(TEMPLATE_DIR, '.tempo.json'), 'utf8')) as { features: string[] };
    tempo.features = tempo.features.filter((name) => name !== 'ssl-pinning');
    await writeFile(path.join(dir, '.tempo.json'), JSON.stringify(tempo, null, 2));
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'tempo-app', dependencies: { zod: '1.0.0' } }, null, 2));
    await writeFile(path.join(dir, '.env.dev'), 'APP_ENV=dev\nDEVICE_INTEGRITY_ENABLED=false\n');
  });
  afterEach(async () => cleanup());

  it('restores dependencies, env keys and files, and writes nothing on a dry run', async () => {
    const dry = await addFeature({ projectDir: dir, cwd: dir, feature: 'ssl-pinning', template: miniDir, dryRun: true });
    expect(dry.added).toContain('src/services/security/pinning/pinning.ts');
    expect(dry.updated).toEqual(expect.arrayContaining(['package.json', '.env.dev', '.tempo.json']));
    expect(await readFile(path.join(dir, '.env.dev'), 'utf8')).not.toContain('SSL_PINS');
    expect((await readTempoJson(dir)).features).not.toContain('ssl-pinning');

    const real = await addFeature({ projectDir: dir, cwd: dir, feature: 'ssl-pinning', template: miniDir });
    expect(real.followUps.join('\n')).toMatch(/yarn install/);
    expect(real.followUps.join('\n')).toMatch(/pod install/);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const templatePkg = JSON.parse(await readFile(path.join(TEMPLATE_DIR, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['react-native-ssl-public-key-pinning']).toBe(templatePkg.dependencies['react-native-ssl-public-key-pinning']);
    expect(await readFile(path.join(dir, '.env.dev'), 'utf8')).toBe('APP_ENV=dev\nSSL_PINNING_ENABLED=false\nSSL_PINS=\nDEVICE_INTEGRITY_ENABLED=false\n');
    expect((await readTempoJson(dir)).features).toContain('ssl-pinning');
    // Files the project lacks (initSecurity.ts, client.ts ...) are reported, not invented.
    expect(real.conflicts.some((conflict) => conflict.file === 'src/services/http/client.ts')).toBe(true);
  });

  it('reports existing module files as conflicts unless --force', async () => {
    const file = path.join(dir, 'src/services/security/pinning/pinning.ts');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'mine');
    const result = await addFeature({ projectDir: dir, cwd: dir, feature: 'ssl-pinning', template: miniDir, dryRun: true });
    expect(result.conflicts).toContainEqual({ file: 'src/services/security/pinning/pinning.ts', reason: expect.stringContaining('already exists') });
    const forced = await addFeature({ projectDir: dir, cwd: dir, feature: 'ssl-pinning', template: miniDir, dryRun: true, force: true });
    expect(forced.updated).toContain('src/services/security/pinning/pinning.ts');
  });

  it('refuses to write through a symlink that leaves the project', async () => {
    const { dir: outside, cleanup: outsideCleanup } = await makeTempDir('tempo-add-outside');
    try {
      await mkdir(path.join(dir, 'src/services'), { recursive: true });
      await symlink(outside, path.join(dir, 'src/services/security'), 'dir');
      await expect(addFeature({ projectDir: dir, cwd: dir, feature: 'ssl-pinning', template: miniDir })).rejects.toThrow(/outside the project/);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await outsideCleanup();
    }
  });

  it('rejects unknown and already enabled features', async () => {
    await expect(addFeature({ projectDir: dir, cwd: dir, feature: 'nope' as never, template: miniDir })).rejects.toThrow(/Unknown feature/);
    await expect(addFeature({ projectDir: dir, cwd: dir, feature: 'samples', template: miniDir })).rejects.toThrow(/already enabled/);
  });
});
