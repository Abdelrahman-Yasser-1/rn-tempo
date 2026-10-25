import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pathExists } from '../src/lib/fs-utils.ts';
import { addEnv, addGradleFlavor, completeEnv, gradleFlavorBlock, iosEnvsScript, listEnvs, removeEnv, removeGradleFlavor } from '../src/lib/env.ts';
import type { Runner } from '../src/lib/pm.ts';
import { readTempoJson } from '../src/lib/tempo-json.ts';
import { copyTemplate, makeTempDir, TEMPLATE_DIR } from './helpers.ts';

const app = { name: 'TempoApp', displayName: 'Tempo', bundleId: 'com.rntempo.app' };

describe('completeEnv', () => {
  it('derives suffix, display name, scheme and badge', () => {
    expect(completeEnv({ name: 'qa' }, app)).toEqual({
      name: 'qa',
      suffix: '.qa',
      displayName: 'Tempo Qa',
      scheme: 'tempo-app-qa',
      badge: 'QA',
    });
    expect(() => completeEnv({ name: 'Bad Name' }, app)).toThrow(/Invalid env name/);
  });
});

describe('gradle flavor blocks', () => {
  it('generates the same text the template uses for staging', async () => {
    const gradle = await readFile(path.join(TEMPLATE_DIR, 'android/app/build.gradle'), 'utf8');
    const block = gradleFlavorBlock({ name: 'staging', suffix: '.staging', displayName: 'Tempo Stg', scheme: 'tempo-staging', badge: 'STG' });
    expect(gradle).toContain(block);
    const prod = gradleFlavorBlock({ name: 'prod', suffix: '', displayName: 'Tempo', scheme: 'tempo', badge: null });
    expect(gradle).toContain(prod);
  });

  it('adds a flavor everywhere and removal restores the original text exactly', async () => {
    const gradle = await readFile(path.join(TEMPLATE_DIR, 'android/app/build.gradle'), 'utf8');
    const qa = completeEnv({ name: 'qa' }, app);
    const added = addGradleFlavor(gradle, qa);
    expect(added).toContain('        qa {');
    expect(added).toContain('qadebug: ".env.qa", qarelease: ".env.qa",');
    expect(added).toContain('"prodDebug", "qaDebug"]');
    expect(addGradleFlavor(added, qa)).toBe(added);
    expect(removeGradleFlavor(added, 'qa')).toBe(gradle);
  });
});

describe('addEnv / removeEnv', () => {
  let dir = '';
  let cleanup = async () => {};
  const calls: string[] = [];
  const runner: Runner = async (command, args) => {
    calls.push([command, ...args].join(' '));
  };
  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-env'));
    await copyTemplate(dir);
    calls.length = 0;
  });
  afterEach(async () => cleanup());

  it('adds qa across .tempo.json, gradle, scripts and .env.qa, then runs the native steps', async () => {
    await addEnv(dir, { name: 'qa' }, { runner });
    expect((await listEnvs(dir)).map((env) => env.name)).toEqual(['dev', 'staging', 'prod', 'qa']);
    expect(await readFile(path.join(dir, 'android/app/build.gradle'), 'utf8')).toContain('applicationIdSuffix ".qa"');
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['android:qa']).toBe('react-native run-android --mode qaDebug --appIdSuffix qa');
    expect(pkg.scripts['ios:qa']).toBe('react-native run-ios --scheme TempoApp-Qa --mode Debug-Qa');
    expect(pkg.scripts['ios:envs']).toContain('--envs dev:Dev,staging:Staging,prod:Prod,qa:Qa --meta \'{"qa":');
    const envFile = await readFile(path.join(dir, '.env.qa'), 'utf8');
    expect(envFile).toContain('APP_ENV=qa');
    expect(envFile).toContain('DEEP_LINK_SCHEME=tempo-app-qa');
    expect(calls.at(-1)).toBe('node scripts/native/icons.mjs');
    if (process.platform === 'darwin') expect(calls[0]).toMatch(/^bundle exec ruby scripts\/native\/ios-envs\.rb --project ios\/TempoApp\.xcodeproj/);
    await expect(addEnv(dir, { name: 'qa' }, { runner })).rejects.toThrow(/already exists/);
  });

  it('removes qa again and leaves the project as it was', async () => {
    const before = await readFile(path.join(dir, 'package.json'), 'utf8');
    const gradleBefore = await readFile(path.join(dir, 'android/app/build.gradle'), 'utf8');
    await addEnv(dir, { name: 'qa' }, { runner, skipNative: true });
    await removeEnv(dir, 'qa', { runner, skipNative: true });
    expect(JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))).toEqual(JSON.parse(before));
    expect(await readFile(path.join(dir, 'android/app/build.gradle'), 'utf8')).toBe(gradleBefore);
    expect(await pathExists(path.join(dir, '.env.qa'))).toBe(false);
    expect((await readTempoJson(dir)).envs).toHaveLength(3);
  });

  it('rejects unknown envs and removing the last one', async () => {
    await expect(removeEnv(dir, 'nope', { skipNative: true })).rejects.toThrow(/does not exist/);
    await removeEnv(dir, 'dev', { skipNative: true });
    await removeEnv(dir, 'staging', { skipNative: true });
    await expect(removeEnv(dir, 'prod', { skipNative: true })).rejects.toThrow(/last env/);
  });

  it('keeps the ios:envs script in sync for the default matrix', async () => {
    const tempo = await readTempoJson(dir);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(iosEnvsScript(tempo)).toBe(pkg.scripts['ios:envs']);
  });
});
