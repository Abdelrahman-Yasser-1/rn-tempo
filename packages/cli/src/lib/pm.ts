import { platform } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

import { pathExists } from './fs-utils.ts';

export type RunOptions = { cwd: string; json?: boolean; env?: Record<string, string> };

/** Runs a command, streaming its output (to stderr with `--json`, so stdout stays machine-readable). */
export type Runner = (command: string, args: readonly string[], options: RunOptions) => Promise<void>;

/** Default runner: execa with inherited, streaming output. */
export const run: Runner = async (command, args, { cwd, json, env }) => {
  await execa(command, [...args], { cwd, env, stdio: json ? ['ignore', 2, 2] : 'inherit' });
};

/** `yarn install` in the project. */
export async function yarnInstall(cwd: string, options: { json?: boolean; runner?: Runner } = {}): Promise<void> {
  await (options.runner ?? run)('yarn', ['install'], { cwd, json: options.json });
}

/** `bundle install` and `pod install` (macOS only; returns false elsewhere or without an ios folder). */
export async function installPods(cwd: string, options: { json?: boolean; runner?: Runner } = {}): Promise<boolean> {
  if (platform() !== 'darwin' || !(await pathExists(path.join(cwd, 'ios')))) return false;
  const runner = options.runner ?? run;
  await runner('bundle', ['install'], { cwd, json: options.json });
  await runner('bundle', ['exec', 'pod', 'install'], { cwd: path.join(cwd, 'ios'), json: options.json });
  return true;
}

/** `git init` (quiet). */
export async function gitInit(cwd: string, options: { json?: boolean; runner?: Runner } = {}): Promise<void> {
  await (options.runner ?? run)('git', ['init', '-q'], { cwd, json: options.json });
}

/**
 * Stages everything and commits. Lefthook is disabled for this one commit (`LEFTHOOK=0`): the
 * scaffold is a machine-made snapshot, and the hooks would lint a tree that has not been installed yet.
 */
export async function gitInitialCommit(cwd: string, message: string, options: { json?: boolean; runner?: Runner } = {}): Promise<void> {
  const runner = options.runner ?? run;
  await runner('git', ['add', '-A'], { cwd, json: options.json });
  await runner('git', ['commit', '-q', '-m', message], { cwd, json: options.json, env: { LEFTHOOK: '0' } });
}

/** Runs a project script through yarn (`yarn <script> ...args`). */
export async function yarnRun(cwd: string, script: string, args: readonly string[] = [], options: { json?: boolean; runner?: Runner } = {}): Promise<void> {
  await (options.runner ?? run)('yarn', [script, ...args], { cwd, json: options.json });
}

export type CaptureResult = { exitCode: number; stdout: string; stderr: string };

/** Runs a command and captures its output; never throws (a missing binary gives exit code 127). */
export type Capturer = (command: string, args: readonly string[], options: { cwd: string }) => Promise<CaptureResult>;

/** Default capturer: execa with `reject: false`. */
export const capture: Capturer = async (command, args, { cwd }) => {
  try {
    const result = await execa(command, [...args], { cwd, reject: false, stdin: 'ignore' });
    return { exitCode: result.exitCode ?? 1, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
  } catch (error) {
    return { exitCode: 127, stdout: '', stderr: error instanceof Error ? error.message : String(error) };
  }
};
