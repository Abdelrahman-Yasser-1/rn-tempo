import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { FEATURE_NAMES } from '@rn-tempo/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiToolsFor, createProject, defaultBundleId, defaultDisplayName, validateCreateInput, type CreateOptions } from '../src/lib/create.ts';
import { pathExists, walkFiles } from '../src/lib/fs-utils.ts';
import { defaultFeatures } from '../src/lib/manifest.ts';
import type { Runner } from '../src/lib/pm.ts';
import { readTempoJson } from '../src/lib/tempo-json.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

describe('create inputs', () => {
  it('validates name, bundle id and envs', () => {
    const ok = { name: 'MyApp', bundleId: 'com.example.myapp', envs: [{ name: 'dev' }] };
    expect(() => validateCreateInput(ok)).not.toThrow();
    expect(() => validateCreateInput({ ...ok, name: 'my-app' })).toThrow(/Invalid app name/);
    expect(() => validateCreateInput({ ...ok, bundleId: 'Com.Example' })).toThrow(/Invalid bundle id/);
    expect(() => validateCreateInput({ ...ok, envs: [] })).toThrow(/at least one env/);
    expect(() => validateCreateInput({ ...ok, envs: [{ name: 'dev' }, { name: 'dev' }] })).toThrow(/twice/);
  });

  it('derives defaults for --yes', () => {
    expect(defaultBundleId('MyApp')).toBe('com.example.myapp');
    expect(defaultDisplayName('MyCoolApp')).toBe('My Cool App');
    expect(aiToolsFor(['samples', 'ai-claude', 'ai-copilot'])).toEqual(['claude', 'copilot']);
  });
});

describe('createProject (end to end, local template, no network, no install)', () => {
  let root = '';
  let cleanup = async () => {};
  const calls: string[] = [];
  const runner: Runner = async (command, args, options) => {
    calls.push(`${path.basename(options.cwd)}: ${[command, ...args].join(' ')}`);
  };
  beforeEach(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-create'));
    calls.length = 0;
  });
  afterEach(async () => cleanup());

  const base = (overrides: Partial<CreateOptions>): CreateOptions => ({
    dir: path.join(root, 'AcmeShop'),
    cwd: root,
    name: 'AcmeShop',
    displayName: 'Acme Shop',
    bundleId: 'io.acme.shop',
    envs: [{ name: 'dev' }, { name: 'staging' }, { name: 'prod' }],
    features: async (manifests) => defaultFeatures(manifests),
    template: TEMPLATE_DIR,
    cliVersion: '0.0.0',
    git: false,
    install: false,
    runner,
    ...overrides,
  });

  it('AC-1: defaults produce a renamed project with a valid .tempo.json and no leftovers', async () => {
    const result = await createProject(base({}));
    const dir = result.dir;
    const tempo = await readTempoJson(dir);
    expect(tempo.app).toEqual({ name: 'AcmeShop', displayName: 'Acme Shop', bundleId: 'io.acme.shop' });
    expect(tempo.createdWith).toBe('create-tempo-app@0.0.0');
    expect(tempo.features).not.toContain('dynamic-forms');
    expect(tempo.features).toContain('ssl-pinning');
    expect(tempo.ai.tools).toEqual(['claude', 'copilot', 'cursor']);
    expect(tempo.envs.map((env) => [env.name, env.displayName, env.scheme])).toEqual([
      ['dev', 'Acme Shop Dev', 'acme-shop-dev'],
      ['staging', 'Acme Shop Stg', 'acme-shop-staging'],
      ['prod', 'Acme Shop', 'acme-shop'],
    ]);

    const offenders: string[] = [];
    for (const file of await walkFiles(dir)) {
      if (file.endsWith('.png') || file === 'yarn.lock') continue;
      const text = await readFile(path.join(dir, file), 'utf8').catch(() => '');
      if (/TempoApp|com\.rntempo\.app|rntempo\/app/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    expect(await pathExists(path.join(dir, 'ios/AcmeShop.xcodeproj'))).toBe(true);
    expect(await pathExists(path.join(dir, 'android/app/src/main/java/io/acme/shop/MainActivity.kt'))).toBe(true);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['@rn-tempo/tsconfig']).toBe('0.0.0');
    expect(calls).toEqual([]); // nothing to run: no env diff, no install
  });

  it('removes unselected features, resolves envs and keeps remaining markers', async () => {
    const wanted = FEATURE_NAMES.filter((name) => name !== 'samples' && name !== 'ssl-pinning' && name !== 'dynamic-forms');
    const result = await createProject(base({ features: wanted, envs: [{ name: 'dev' }, { name: 'qa' }, { name: 'prod' }] }));
    const tempo = await readTempoJson(result.dir);
    expect(tempo.features).not.toContain('samples');
    expect(tempo.envs.map((env) => env.name)).toEqual(['dev', 'prod', 'qa']);
    const types = await readFile(path.join(result.dir, 'src/navigation/types.ts'), 'utf8');
    expect(types).not.toContain('ItemsList');
    expect(types).not.toContain('@tempo-feature:samples');
    const gradle = await readFile(path.join(result.dir, 'android/app/build.gradle'), 'utf8');
    expect(gradle).not.toContain('staging {');
    expect(gradle).toContain('qa {');
    expect(calls.at(-1)).toBe('AcmeShop: node scripts/native/icons.mjs');
    expect(await pathExists(path.join(result.dir, '.env.qa'))).toBe(true);
  });

  it('adds required features and reports them', async () => {
    const result = await createProject(base({ features: ['maestro'] }));
    expect(result.features).toEqual(['maestro']);
    expect(result.autoAdded).toEqual([]);
  });

  it('runs git init, install, pods and the initial commit in order', async () => {
    await createProject(base({ git: true, install: true }));
    const order = calls.map((call) => call.replace(/^[^:]+: /, ''));
    expect(order[0]).toBe('git init -q');
    expect(order[1]).toBe('yarn install');
    expect(order.at(-1)).toMatch(/^git commit -q -m chore\(repo\): initialize from rn-tempo v0\.0\.0$/);
    expect(order.indexOf('git add -A')).toBeGreaterThan(order.indexOf('yarn install'));
  });

  it('refuses a non-empty target directory', async () => {
    await createProject(base({}));
    await expect(createProject(base({}))).rejects.toThrow(/not empty/);
  });
});
