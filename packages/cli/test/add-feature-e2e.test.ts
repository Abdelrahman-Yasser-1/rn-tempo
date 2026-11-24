import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { FEATURE_NAMES, type FeatureName } from '@rn-tempo/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addFeature } from '../src/lib/add-feature.ts';
import { createProject, type CreateOptions } from '../src/lib/create.ts';
import { copyLocalTemplate } from '../src/lib/fetch-template.ts';
import { walkFiles } from '../src/lib/fs-utils.ts';
import { loadManifests } from '../src/lib/manifest.ts';
import { removeFeatures } from '../src/lib/remove-feature.ts';
import { readTempoJson, writeTempoJson } from '../src/lib/tempo-json.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

/** Differences between "create with the module" and "create without it, then feature add" we accept. */
const ACCEPTED_DIFFERENCES: readonly string[] = [];

async function readAll(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  // A byte comparison must include generated icons and other assets skipped by the CLI's source walk.
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files.set(path.relative(dir, file), (await readFile(file)).toString('base64'));
  }
  return files;
}

// Copies the whole template per module (~10 min), so it runs only via `yarn test:e2e` (TEMPO_E2E=1).
describe.skipIf(process.env.TEMPO_E2E !== '1')('tempo feature add (real template, local --template, no network, no install)', { timeout: 900_000 }, () => {
  let root = '';
  let template = '';
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
    template,
    cliVersion: '0.0.0',
    git: false,
    install: false,
  });

  beforeAll(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-add-e2e'));
    template = path.join(root, 'template');
    await copyLocalTemplate(TEMPLATE_DIR, template);
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

  it('removes app-icons from a renamed project and restores every byte', async () => {
    const dir = path.join(root, 'baseline');
    const metadata = await readTempoJson(dir);
    const keep = metadata.features.filter((name) => name !== 'app-icons');
    await removeFeatures(dir, await loadManifests(dir), ['app-icons'], keep);
    await writeTempoJson(dir, { ...metadata, features: keep });
    const files = await walkFiles(dir);
    const removed = [
      /AppIconModule|AppIconPackage|AppIconScreen|useCurrentAppIcon|AlternateIcons/,
      /src\/services\/app-icon\/|icons-source\/(?:alternates|previews)\//,
      /icons-source\/svg\/(?:forest|ocean|sunset)\.svg|icons-alternates\.test\.mjs/,
      /ic_launcher_(?:ocean|forest|sunset)|-(?:Ocean|Forest|Sunset)\.appiconset/,
    ];
    expect(files.filter((file) => removed.some((pattern) => pattern.test(file)))).toEqual([]);
    expect(files).toContain('src/assets/icons-source/svg/default.svg');
    for (const flavor of ['dev', 'staging', 'prod']) {
      expect(files).toContain(`android/app/src/${flavor}/res/mipmap-mdpi/ic_launcher.png`);
    }
    const manifest = await readFile(path.join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toContain('<activity-alias');
    const activity = manifest.match(/<activity\s[^>]*android:name="\.MainActivity"[\s\S]*?<\/activity>/)?.[0];
    expect(activity).toContain('android.intent.action.MAIN');
    expect(activity).toContain('android:name="${primaryLauncherCategory}"');
    const gradle = await readFile(path.join(dir, 'android/app/build.gradle'), 'utf8');
    expect(gradle.match(/manifestPlaceholders\.primaryLauncherCategory = ".+?"/g)).toEqual([
      'manifestPlaceholders.primaryLauncherCategory = "android.intent.category.LAUNCHER"',
    ]);
    expect(await readFile(path.join(dir, 'ios/AcmeShop/NativeModules.mm'), 'utf8')).not.toContain('AppIconModule');
    const project = await readFile(path.join(dir, 'ios/AcmeShop.xcodeproj/project.pbxproj'), 'utf8');
    expect(project).toContain('NativeModules.mm in Sources');
    expect(project).not.toContain('AppIconModule');
    expect(JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))).not.toHaveProperty('codegenConfig');
    for (const language of ['en', 'ar', 'es', 'de', 'fr']) {
      expect(JSON.parse(await readFile(path.join(dir, 'src/locales', language, 'settings.json'), 'utf8'))).not.toHaveProperty('appIcon');
    }
    const result = await addFeature({ projectDir: dir, cwd: root, feature: 'app-icons', template });
    expect(result.conflicts).toEqual([]);
    expect(await readAll(dir)).toEqual(baseline);
  });

  it.each(['app-icons', 'samples', 'storybook', 'ssl-pinning', 'dynamic-forms', 'webview', 'file-picker', 'maps', 'firebase-core', 'push-notifications', 'crashlytics', 'ai-vendored-skills'] as const)(
    'creating without %s and adding it back matches a project created with it',
    async (feature) => {
      const dropped = [feature, ...(DEPENDENTS[feature] ?? [])];
      const created = await createProject(base(feature, FEATURE_NAMES.filter((name) => !dropped.includes(name))));
      const before = await readAll(created.dir);
      const dry = await addFeature({ projectDir: created.dir, cwd: root, feature, template, dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.updated).toContain('.tempo.json');
      expect(await readAll(created.dir)).toEqual(before); // a dry run writes nothing
      const result = await addFeature({ projectDir: created.dir, cwd: root, feature, template });
      expect(result.added.length + result.updated.length).toBeGreaterThan(1);
      await expect(addFeature({ projectDir: created.dir, cwd: root, feature, template })).rejects.toThrow(/already enabled/);
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
