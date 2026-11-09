import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { FEATURE_NAMES, type FeatureName } from '@rn-tempo/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addFeature } from '../src/lib/add-feature.ts';
import { createProject, type CreateOptions } from '../src/lib/create.ts';
import { walkFiles } from '../src/lib/fs-utils.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

/** Differences between "create with the module" and "create without it, then feature add" we accept. */
const ACCEPTED_DIFFERENCES: readonly string[] = [];

async function readAll(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const file of await walkFiles(dir)) files.set(file, (await readFile(path.join(dir, file))).toString('base64'));
  return files;
}

// Copies the whole template per module (~10 min), so it runs only via `yarn test:e2e` (TEMPO_E2E=1).
describe.skipIf(process.env.TEMPO_E2E !== '1')('tempo feature add (real template, local --template, no network, no install)', { timeout: 900_000 }, () => {
  let root = '';
  let cleanup = async () => {};
  let baseline = new Map<string, string>();

  const base = (name: string, features: readonly FeatureName[]): CreateOptions => ({
    dir: path.join(root, name),
    cwd: root,
    name: 'AcmeShop',
    displayName: 'Acme Shop',
    bundleId: 'io.acme.shop',
    envs: [{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }],
    features,
    template: TEMPLATE_DIR,
    cliVersion: '0.0.0',
    git: false,
    install: false,
  });

  beforeAll(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-add-e2e'));
    const result = await createProject(base('baseline', FEATURE_NAMES));
    baseline = await readAll(result.dir);
  });
  afterAll(async () => cleanup());

  /**
   * Modules that other modules require cannot be left out alone: creating without them also drops the
   * modules that require them (otherwise the CLI adds them back). Those are left out too, and the
   * comparison project is created without the dependents as well.
   */
  const DEPENDENTS: Partial<Record<FeatureName, readonly FeatureName[]>> = {
    'firebase-core': ['push-notifications', 'crashlytics'],
  };

  it.each(['samples', 'storybook', 'ssl-pinning', 'dynamic-forms', 'webview', 'file-picker', 'maps', 'firebase-core', 'push-notifications', 'crashlytics', 'ai-vendored-skills'] as const)(
    'creating without %s and adding it back matches a project created with it',
    async (feature) => {
      const dropped = [feature, ...(DEPENDENTS[feature] ?? [])];
      const created = await createProject(base(feature, FEATURE_NAMES.filter((name) => !dropped.includes(name))));
      const before = await readAll(created.dir);
      const dry = await addFeature({ projectDir: created.dir, cwd: root, feature, template: TEMPLATE_DIR, dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.updated).toContain('.tempo.json');
      expect(await readAll(created.dir)).toEqual(before); // a dry run writes nothing
      const result = await addFeature({ projectDir: created.dir, cwd: root, feature, template: TEMPLATE_DIR });
      expect(result.added.length + result.updated.length).toBeGreaterThan(1);
      await expect(addFeature({ projectDir: created.dir, cwd: root, feature, template: TEMPLATE_DIR })).rejects.toThrow(/already enabled/);
      expect(result.conflicts).toEqual([]);
      const actual = await readAll(created.dir);
      const expected =
        dropped.length === 1
          ? baseline
          : await readAll((await createProject(base(`${feature}-with`, FEATURE_NAMES.filter((name) => !dropped.slice(1).includes(name))))).dir);
      const differences = [...new Set([...expected.keys(), ...actual.keys()])]
        .filter((file) => expected.get(file) !== actual.get(file))
        .filter((file) => !ACCEPTED_DIFFERENCES.includes(file));
      expect(differences).toEqual([]);
    },
  );
});
