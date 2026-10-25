import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planClean, runClean } from '../src/lib/clean.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import type { Capturer, Runner } from '../src/lib/pm.ts';
import { makeTempDir } from './helpers.ts';

describe('tempo clean', () => {
  let root = '';
  let project = '';
  let tmp = '';
  let home = '';
  let cleanup = async () => {};
  beforeEach(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-clean'));
    project = path.join(root, 'app');
    tmp = path.join(root, 'tmp');
    home = path.join(root, 'home');
    for (const rel of ['node_modules/.cache', 'ios/Pods', 'ios/build/generated', 'android/.gradle', 'android/app/build']) {
      await mkdir(path.join(project, rel), { recursive: true });
    }
    await mkdir(path.join(tmp, 'metro-cache'), { recursive: true });
    await mkdir(path.join(tmp, 'other'), { recursive: true });
    await mkdir(path.join(home, 'Library/Developer/Xcode/DerivedData/AcmeShop-abc'), { recursive: true });
    await mkdir(path.join(home, 'Library/Developer/Xcode/DerivedData/Other-abc'), { recursive: true });
    await writeFile(path.join(project, 'ios/Podfile'), '');
  });
  afterEach(async () => cleanup());

  it('lists only existing targets and matches the app-specific DerivedData', async () => {
    const targets = await planClean(project, 'AcmeShop', { tmpdir: tmp, home });
    expect(targets.map((target) => target.id)).toEqual(['node-cache', 'metro', 'pods', 'ios-build', 'gradle', 'android-build', 'derived-data', 'watchman']);
    const derived = targets.find((target) => target.id === 'derived-data');
    expect(derived?.paths).toEqual([path.join(home, 'Library/Developer/Xcode/DerivedData/AcmeShop-abc')]);
  });

  it('removes selected targets and re-runs pod install when ios/build or ios/Pods went away', async () => {
    const calls: string[] = [];
    const runner: Runner = async (command, args) => {
      calls.push([command, ...args].join(' '));
    };
    const capturer: Capturer = async (command) => {
      calls.push(command);
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    const targets = await planClean(project, 'AcmeShop', { tmpdir: tmp, home });
    const result = await runClean(project, targets, { runner, capturer });
    expect(await pathExists(path.join(project, 'ios/build'))).toBe(false);
    expect(await pathExists(path.join(tmp, 'other'))).toBe(true);
    expect(await pathExists(path.join(home, 'Library/Developer/Xcode/DerivedData/Other-abc'))).toBe(true);
    expect(calls).toContain('watchman');
    if (process.platform === 'darwin') {
      expect(result.podsReinstalled).toBe(true);
      expect(calls).toContain('bundle exec pod install');
    }
  });

  it('does not run pod install when only unrelated caches are removed', async () => {
    const calls: string[] = [];
    const runner: Runner = async (command) => {
      calls.push(command);
    };
    const targets = (await planClean(project, 'AcmeShop', { tmpdir: tmp, home })).filter((target) => target.id === 'gradle');
    const result = await runClean(project, targets, { runner });
    expect(result.podsReinstalled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('skips pod install with skipPods', async () => {
    const targets = (await planClean(project, 'AcmeShop', { tmpdir: tmp, home })).filter((target) => target.id === 'ios-build');
    const result = await runClean(project, targets, { skipPods: true });
    expect(result.podsReinstalled).toBe(false);
  });
});
