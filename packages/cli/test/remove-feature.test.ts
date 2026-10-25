import { cp, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyJsonRemove, removeFeatures } from '../src/lib/remove-feature.ts';
import { loadManifests, planRemoval } from '../src/lib/manifest.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import { copyFixtureProject, makeTempDir } from './helpers.ts';

describe('removeFeatures', () => {
  let dir = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-remove'));
    await copyFixtureProject(dir);
    await cp(path.join(dir, '.env.example'), path.join(dir, '.env.dev'));
  });
  afterEach(async () => cleanup());

  const read = (rel: string) => readFile(path.join(dir, rel), 'utf8');

  it('removes ssl-pinning: markers, globs, deps, env keys and queues pods', async () => {
    const manifests = await loadManifests(dir);
    const enabled = [...manifests.keys()];
    const plan = planRemoval(manifests, enabled, ['ssl-pinning']);
    const result = await removeFeatures(dir, manifests, plan.remove, plan.keep);

    expect(result.postRemove).toEqual(['pods']);
    expect(await pathExists(path.join(dir, 'src/services/security/pinning'))).toBe(false);
    // The now-empty parent stays because integrity still lives in it.
    expect(await pathExists(path.join(dir, 'src/services/security/integrity'))).toBe(true);
    const app = await read('src/App.tsx');
    expect(app).not.toContain('initPinning');
    expect(app).toContain('initIntegrity');
    expect(app).toContain('@tempo-feature:device-integrity:start');
    expect(JSON.parse(await read('package.json')).dependencies).not.toHaveProperty('react-native-ssl-public-key-pinning');
    expect(JSON.parse(await read('package.json')).dependencies).toHaveProperty('jail-monkey');
    for (const file of ['.env.dev', '.env.example']) {
      const env = await read(file);
      expect(env).not.toContain('SSL_PIN');
      expect(env).toContain('DEVICE_INTEGRITY_ENABLED');
    }
  });

  it('removes storybook: glob patterns, devDependencies and script patches', async () => {
    const manifests = await loadManifests(dir);
    const plan = planRemoval(manifests, [...manifests.keys()], ['storybook']);
    const result = await removeFeatures(dir, manifests, plan.remove, plan.keep);
    expect(await pathExists(path.join(dir, 'src/shared/components/Button/Button.stories.tsx'))).toBe(false);
    expect(await pathExists(path.join(dir, 'src/shared/components/Button/Button.tsx'))).toBe(true);
    const pkg = JSON.parse(await read('package.json'));
    expect(pkg.scripts).not.toHaveProperty('storybook');
    expect(pkg.scripts).not.toHaveProperty('storybook:generate');
    expect(pkg.scripts).toHaveProperty('lint');
    expect(Object.keys(pkg.devDependencies)).toEqual(['danger']);
    expect(result.patchedFiles).toEqual(['package.json']);
  });

  it('removes samples and maestro in one go (globs with dirs and file patterns)', async () => {
    const manifests = await loadManifests(dir);
    const plan = planRemoval(manifests, [...manifests.keys()], ['samples', 'maestro']);
    await removeFeatures(dir, manifests, plan.remove, plan.keep);
    expect(await pathExists(path.join(dir, 'src/features'))).toBe(false);
    expect(await pathExists(path.join(dir, 'e2e'))).toBe(false);
    expect(await pathExists(path.join(dir, '.github/workflows/e2e.yml'))).toBe(false);
    expect(await pathExists(path.join(dir, '.github/workflows/pr.yml'))).toBe(true);
    expect(JSON.parse(await read('package.json')).scripts).not.toHaveProperty('e2e');
  });

  it('is idempotent: a second run changes nothing and does not fail', async () => {
    const manifests = await loadManifests(dir);
    const plan = planRemoval(manifests, [...manifests.keys()], ['ssl-pinning']);
    await removeFeatures(dir, manifests, plan.remove, plan.keep);
    const again = await removeFeatures(dir, manifests, plan.remove, plan.keep);
    expect(again.strippedFiles).toEqual([]);
    expect(again.deletedPaths).toEqual([]);
    expect(again.removedDependencies).toEqual([]);
  });
});

describe('applyJsonRemove', () => {
  it('removes object keys and array items, and reports missing paths', () => {
    const doc = { a: { 'b/c': 1, list: [1, 2, 3] } };
    expect(applyJsonRemove(doc, '/a/b~1c')).toBe(true);
    expect(applyJsonRemove(doc, '/a/list/1')).toBe(true);
    expect(doc).toEqual({ a: { list: [1, 3] } });
    expect(applyJsonRemove(doc, '/missing/x')).toBe(false);
  });
});
