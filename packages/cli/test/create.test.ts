import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { FEATURE_NAMES } from '@rn-tempo/contracts';
import { execa } from 'execa';
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
    expect(tempo.features).not.toContain('cms');
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
    expect(await pathExists(path.join(dir, 'src/services/cms'))).toBe(false);
    expect(await pathExists(path.join(dir, 'src/features/whats-new'))).toBe(false);
    expect(await pathExists(path.join(dir, 'src/locales/en/whats-new.json'))).toBe(false);
    expect(await readFile(path.join(dir, '.env.example'), 'utf8')).not.toContain('CMS_');
    expect(await pathExists(path.join(dir, 'ios/AcmeShop.xcodeproj'))).toBe(true);
    expect(await pathExists(path.join(dir, 'android/app/src/main/java/io/acme/shop/MainActivity.kt'))).toBe(true);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['@rn-tempo/tsconfig']).toBe('0.0.0');
    expect(pkg.devDependencies['create-tempo-app']).toBe('0.0.0'); // exact pin, so `yarn tempo` works
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

  it('pins the CLI version exactly as a devDependency of the new project', async () => {
    const result = await createProject(base({ cliVersion: '1.4.2' }));
    const pkg = JSON.parse(await readFile(path.join(result.dir, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['create-tempo-app']).toBe('1.4.2');
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

  describe('ai sync step', () => {
    const syncCall = 'node scripts/ai-sync/sync.mjs';
    const commands = () => calls.map((call) => call.replace(/^[^:]+: /, ''));

    it('AC-1: runs after install and pods, before the initial commit, and is listed in the steps', async () => {
      const result = await createProject(base({ git: true, install: true }));
      const order = commands();
      expect(order.filter((call) => call === syncCall)).toHaveLength(1);
      expect(order.indexOf(syncCall)).toBeGreaterThan(order.indexOf('yarn install'));
      expect(order.indexOf(syncCall)).toBeLessThan(order.indexOf('git add -A'));
      expect(calls.find((call) => call.endsWith(syncCall))).toMatch(/^AcmeShop: /); // runs inside the new project
      const steps = result.steps;
      expect(steps.indexOf('ai sync')).toBeGreaterThan(steps.indexOf('install'));
      expect(steps.indexOf('ai sync')).toBeLessThan(steps.indexOf('git commit'));
      expect(result.notes).toEqual([]);
    });

    it('AC-1: is skipped, with a note, when install is skipped (also the case for upgrade snapshots)', async () => {
      const result = await createProject(base({ git: true, install: false }));
      expect(commands()).not.toContain(syncCall);
      expect(result.steps).not.toContain('ai sync');
      expect(result.notes).toEqual([expect.stringContaining('ai sync skipped: dependencies were not installed')]);
    });

    it('AC-1: is skipped, with a note, when no AI tool is selected', async () => {
      const result = await createProject(base({ install: true, features: ['maestro'] }));
      expect(commands()).not.toContain(syncCall);
      expect(result.steps).toContain('install');
      expect(result.steps).not.toContain('ai sync');
      expect(result.notes).toEqual(['ai sync skipped: no AI tools selected.']);
    });

    it('AC-1: is skipped, with a note, when the template has no ai sync script', async () => {
      const dropScript: Runner = async (command, args, options) => {
        await runner(command, args, options);
        if (command === 'yarn') await rm(path.join(options.cwd, 'scripts/ai-sync/sync.mjs'));
      };
      const result = await createProject(base({ install: true, runner: dropScript }));
      expect(commands()).not.toContain(syncCall);
      expect(result.steps).not.toContain('ai sync');
      expect(result.notes).toEqual([expect.stringContaining('scripts/ai-sync/sync.mjs not found')]);
    });

    it('AC-1: a failing sync warns and notes instead of failing the create', async () => {
      const failing: Runner = async (command, args, options) => {
        if (command === 'node') throw new Error('boom');
        await runner(command, args, options);
      };
      const warnings: string[] = [];
      const result = await createProject(base({ install: true, runner: failing, onWarn: (message) => warnings.push(message) }));
      expect(result.steps).toContain('install');
      expect(result.steps).not.toContain('ai sync');
      expect(result.notes).toEqual([expect.stringContaining('ai sync failed: boom')]);
      expect(warnings).toEqual(result.notes);
    });

    it('AC-1: the real script writes only the selected tools, and its output goes through the runner (stderr with --json)', async () => {
      const seen: { json?: boolean }[] = [];
      const real: Runner = async (command, args, options) => {
        if (command !== 'node') return runner(command, args, options);
        seen.push({ json: options.json });
        await execa(command, [...args], { cwd: options.cwd, stdio: 'pipe' });
      };
      const result = await createProject(base({ install: true, json: true, runner: real, features: ['ai-claude'] }));
      expect(result.steps).toContain('ai sync');
      expect(seen).toEqual([{ json: true }]);
      expect((await readTempoJson(result.dir)).ai.tools).toEqual(['claude']);
      expect(await pathExists(path.join(result.dir, '.cursor/rules'))).toBe(false);
    });
  });

  it('refuses a non-empty target directory', async () => {
    await createProject(base({}));
    await expect(createProject(base({}))).rejects.toThrow(/not empty/);
  });
});
