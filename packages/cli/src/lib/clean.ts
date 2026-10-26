import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { pathExists, removePath } from './fs-utils.ts';
import { capture, installPods, type Capturer, type Runner } from './pm.ts';

export type CleanTarget = {
  id: string;
  label: string;
  /** Absolute paths to delete. */
  paths: string[];
  /** Runs a command instead of deleting paths. */
  command?: { cmd: string; args: string[] };
  /** Deleting this requires `pod install` afterwards (it holds codegen output or the Pods themselves). */
  needsPods?: boolean;
};

async function matching(dir: string, prefix: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => name.startsWith(prefix)).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/**
 * The caches `tempo clean` can remove. Only targets that exist are returned.
 *
 * `ios/build` holds React Native codegen output written by `pod install` (amendment 20): deleting
 * it without re-running `pod install` breaks the next build. `clean` therefore re-runs `pod install`
 * whenever it removed `ios/build` or `ios/Pods` (macOS only); it never leaves the project half-clean.
 */
export async function planClean(
  dir: string,
  appName: string,
  env: { tmpdir?: string; home?: string } = {},
): Promise<CleanTarget[]> {
  const tmp = env.tmpdir ?? os.tmpdir();
  const home = env.home ?? os.homedir();
  const candidates: CleanTarget[] = [
    { id: 'node-cache', label: 'node_modules/.cache', paths: [path.join(dir, 'node_modules/.cache')] },
    { id: 'metro', label: 'Metro cache in the temp dir', paths: await matching(tmp, 'metro-') },
    { id: 'haste', label: 'Haste map in the temp dir', paths: await matching(tmp, 'haste-map-') },
    { id: 'pods', label: 'ios/Pods', paths: [path.join(dir, 'ios/Pods')], needsPods: true },
    { id: 'ios-build', label: 'ios/build (codegen output, restored by pod install)', paths: [path.join(dir, 'ios/build')], needsPods: true },
    { id: 'gradle', label: 'android/.gradle', paths: [path.join(dir, 'android/.gradle')] },
    { id: 'android-build', label: 'android/app/build', paths: [path.join(dir, 'android/app/build')] },
    {
      id: 'derived-data',
      label: `Xcode DerivedData for ${appName}`,
      paths: await matching(path.join(home, 'Library/Developer/Xcode/DerivedData'), `${appName}-`),
    },
  ];
  const existing: CleanTarget[] = [];
  for (const candidate of candidates) {
    const present: string[] = [];
    for (const target of candidate.paths) if (await pathExists(target)) present.push(target);
    if (present.length > 0) existing.push({ ...candidate, paths: present });
  }
  existing.push({ id: 'watchman', label: 'Watchman watches', paths: [], command: { cmd: 'watchman', args: ['watch-del-all'] } });
  return existing;
}

export type CleanResult = { removed: string[]; skipped: string[]; podsReinstalled: boolean };

/**
 * Executes the selected targets. Returns what was removed. Re-runs pod install when a `needsPods`
 * target was removed, unless `skipPods` is set.
 */
export async function runClean(
  dir: string,
  targets: readonly CleanTarget[],
  options: { json?: boolean; skipPods?: boolean; runner?: Runner; capturer?: Capturer } = {},
): Promise<CleanResult> {
  const removed: string[] = [];
  const skipped: string[] = [];
  let needsPods = false;
  for (const target of targets) {
    if (target.command) {
      const result = await (options.capturer ?? capture)(target.command.cmd, target.command.args, { cwd: dir });
      (result.exitCode === 0 ? removed : skipped).push(target.id);
      continue;
    }
    for (const item of target.paths) await removePath(item);
    removed.push(target.id);
    if (target.needsPods) needsPods = true;
  }
  const podsReinstalled = needsPods && !options.skipPods && (await installPods(dir, { json: options.json, runner: options.runner }));
  return { removed, skipped, podsReinstalled };
}
