import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CommandDef } from 'citty';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import ai from '../src/commands/ai.ts';
import assets from '../src/commands/assets.ts';
import clean from '../src/commands/clean.ts';
import create from '../src/commands/create.ts';
import doctor from '../src/commands/doctor.ts';
import env from '../src/commands/env.ts';
import feature from '../src/commands/feature.ts';
import generate from '../src/commands/generate.ts';
import icons from '../src/commands/icons.ts';
import rename from '../src/commands/rename.ts';
import spec from '../src/commands/spec.ts';
import upgrade from '../src/commands/upgrade.ts';
import { copyTemplate, makeTempDir, TEMPLATE_DIR } from './helpers.ts';
import { runJson } from './project-command.ts';

// Wraps (does not replace) execa so the test can see how the CLI starts child processes.
const execaCalls = vi.hoisted(() => [] as { command: string; args: readonly string[]; options: Record<string, unknown> }[]);
vi.mock('execa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('execa')>();
  const wrapped = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
    execaCalls.push({ command, args, options });
    return actual.execa(command, args as string[], options as never);
  }) as unknown as typeof actual.execa;
  return { ...actual, execa: wrapped };
});

type Case = {
  name: string;
  command: CommandDef<never>;
  args: string[];
  /** Run in an empty folder instead of the template copy. */
  empty?: boolean;
  exitCode: number;
  /** Subset of the single JSON document on stdout. */
  result: Record<string, unknown>;
};

const failure = (code: string) => ({ ok: false, error: expect.objectContaining({ code, message: expect.any(String), details: expect.any(Array) }) });
const as = (command: unknown) => command as CommandDef<never>;

// Every command runs through citty with `--json`; `runJson` parses the whole of stdout as one JSON document.
// Cases are read-only (dry runs and error paths) and share one copy of the template.
const readOnly: Case[] = [
  { name: 'ai sync --check', command: as(ai), args: ['sync', '--check'], exitCode: 0, result: { ok: true, check: true } },
  { name: 'ai report', command: as(ai), args: ['report', '--since', '1d'], exitCode: 0, result: { ok: true, summary: expect.any(String) } },
  { name: 'assets sync (error: not a project)', command: as(assets), args: ['sync'], empty: true, exitCode: 1, result: failure('ASSETS_SCRIPT_MISSING') },
  { name: 'clean --dry-run', command: as(clean), args: ['--dry-run'], exitCode: 0, result: { ok: true, dryRun: true, targets: expect.any(Array) } },
  { name: 'doctor', command: as(doctor), args: ['--offline', '--skip-lint'], exitCode: 1, result: { checks: expect.any(Array) } },
  { name: 'env list', command: as(env), args: ['list'], exitCode: 0, result: { ok: true, envs: expect.any(Array) } },
  { name: 'env add (error)', command: as(env), args: ['add', 'Not Valid'], exitCode: 1, result: failure('INVALID_ENV') },
  { name: 'feature list', command: as(feature), args: ['list'], exitCode: 0, result: { ok: true, features: expect.any(Array) } },
  { name: 'feature remove (error)', command: as(feature), args: ['remove', 'nope'], exitCode: 1, result: failure('UNKNOWN_FEATURE') },
  {
    name: 'feature add --dry-run (error: already enabled)',
    command: as(feature),
    args: ['add', 'samples', '--dry-run', '--template', TEMPLATE_DIR],
    exitCode: 1,
    result: { ok: false },
  },
  { name: 'generate feature --dry-run', command: as(generate), args: ['feature', 'wallet', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'feature', dryRun: true } },
  { name: 'generate screen --dry-run', command: as(generate), args: ['screen', 'Detail', '--feature', 'items', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'screen' } },
  { name: 'generate component --dry-run', command: as(generate), args: ['component', 'JsonProbe', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'component' } },
  { name: 'generate hook --dry-run', command: as(generate), args: ['hook', 'useThing', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'hook' } },
  { name: 'generate store --dry-run', command: as(generate), args: ['store', 'cart', '--feature', 'items', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'store' } },
  { name: 'generate query --dry-run', command: as(generate), args: ['query', 'getThing', '--feature', 'items', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'query' } },
  { name: 'generate endpoint --dry-run', command: as(generate), args: ['endpoint', 'items.getThing', '--dry-run'], exitCode: 0, result: { ok: true, kind: 'endpoint' } },
  { name: 'generate screen (error)', command: as(generate), args: ['screen', 'Detail'], exitCode: 1, result: failure('MISSING_FEATURE') },
  { name: 'rename (error)', command: as(rename), args: [], exitCode: 1, result: failure('NOTHING_TO_DO') },
  { name: 'spec new --dry-run', command: as(spec), args: ['new', 'wallet-history', '--dry-run'], exitCode: 0, result: { ok: true, dryRun: true, created: expect.any(Array) } },
  { name: 'spec new (error)', command: as(spec), args: ['new', 'Bad Name'], exitCode: 1, result: failure('INVALID_SPEC_NAME') },
  { name: 'spec check', command: as(spec), args: ['check'], exitCode: 0, result: { ok: expect.any(Boolean) } },
  { name: 'upgrade --template (same version)', command: as(upgrade), args: ['--template', TEMPLATE_DIR], exitCode: 0, result: { ok: true, patch: null, applied: false } },
];

describe('--json prints exactly one document on stdout for every command', () => {
  let root: string;
  let project: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-json'));
    project = path.join(root, 'project');
    await copyTemplate(project);
    // Cheap stand-ins for the generators that need installed dependencies; both print to stdout like the real ones.
    const noisy = "console.log('generator output that must not reach the stdout of tempo --json');\n";
    await writeFile(path.join(project, 'scripts/assets.mjs'), noisy);
    await writeFile(path.join(project, 'scripts/native/icons.mjs'), noisy);
    await mkdir(path.join(project, '.tempo'), { recursive: true });
  }, 300_000);
  afterAll(async () => cleanup());

  it.each(readOnly)('$name', async ({ command, args, empty, exitCode, result }) => {
    const run = await runJson(command, empty ? root : project, ...args);
    expect(run.exitCode).toBe(exitCode);
    expect(run.result).toMatchObject(result);
  });

  describe('commands that change the project', () => {
    it('assets sync and icons keep generator output off stdout', async () => {
      execaCalls.length = 0;
      expect(await runJson(as(assets), project, 'sync')).toMatchObject({ result: { ok: true }, exitCode: 0 });
      expect(await runJson(as(icons), project)).toMatchObject({ result: { ok: true, envs: expect.any(Array) }, exitCode: 0 });
      const streamed = execaCalls.filter((call) => 'stdio' in call.options);
      expect(streamed.map((call) => call.args)).toEqual([['scripts/assets.mjs'], ['scripts/native/icons.mjs']]);
      for (const call of streamed) expect(call.options.stdio).toEqual(['ignore', 2, 2]);
    });

    it('env add and env remove', async () => {
      const added = await runJson(as(env), project, 'add', 'qa', '--skip-native');
      expect(added).toMatchObject({ result: { ok: true, env: { name: 'qa' } }, exitCode: 0 });
      expect(await runJson(as(env), project, 'add', 'qa', '--skip-native')).toMatchObject({ result: { ok: false }, exitCode: 1 });
      expect(await runJson(as(env), project, 'remove', 'qa', '--skip-native')).toMatchObject({ result: { ok: true, env: { name: 'qa' } }, exitCode: 0 });
    });

    it('never prompts with --json, even on a terminal', async () => {
      const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      try {
        await runJson(as(env), project, 'add', 'uat', '--skip-native');
        expect(await runJson(as(env), project, 'remove', 'uat', '--skip-native')).toMatchObject({ result: { ok: true }, exitCode: 0 });
        expect(await runJson(as(feature), project, 'remove', 'samples', '--skip-post')).toMatchObject({
          result: { ok: true, removed: expect.arrayContaining(['samples']) },
          exitCode: 0,
        });
      } finally {
        if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor);
        else Reflect.deleteProperty(process.stdin, 'isTTY');
      }
    });

    it('feature remove of a module that is not enabled', async () => {
      expect(await runJson(as(feature), project, 'remove', 'samples', '--skip-post')).toMatchObject({ result: { ok: true, removed: [] }, exitCode: 0 });
    });

    it('feature add --dry-run reports the dry run and every enabled module', async () => {
      const run = await runJson(as(feature), project, 'add', 'samples', '--dry-run', '--template', TEMPLATE_DIR);
      expect(run).toMatchObject({
        result: { ok: true, feature: 'samples', features: expect.arrayContaining(['samples']), dryRun: true, added: expect.any(Array), conflicts: [] },
        exitCode: 0,
      });
    });

    it('rename', async () => {
      const run = await runJson(as(rename), project, '--display-name', 'Json Test');
      expect(run).toMatchObject({ result: { ok: true, app: { displayName: 'Json Test' } }, exitCode: 0 });
    });

    it('create (success) and create (error)', async () => {
      const failed = await runJson(as(create), root, 'bad-name', '--yes');
      expect(failed).toMatchObject({ result: failure('INVALID_NAME'), exitCode: 1 });
      const made = await runJson(
        as(create),
        root,
        'JsonApp',
        '--yes',
        '--skip-git',
        '--skip-install',
        '--template',
        TEMPLATE_DIR,
      );
      expect(made).toMatchObject({
        result: { ok: true, dir: path.join(root, 'JsonApp'), steps: expect.arrayContaining(['fetch', 'metadata']), nextSteps: expect.any(Array) },
        exitCode: 0,
      });
    });
  });
});
