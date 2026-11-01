import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import generateCommand from '../src/commands/generate.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import { copyFixtureProject, FIXTURES_DIR, makeTempDir } from './helpers.ts';

type JsonResult = {
  ok: boolean;
  kind?: string;
  dryRun?: boolean;
  created?: string[];
  updated?: string[];
  followUps?: string[];
  register?: { updated: string[]; notes: string[] };
  error?: { code: string; message: string; details: string[] };
};

describe('tempo g <kind> --json', () => {
  let dir = '';
  let cleanup = async () => {};
  let stdout: string[] = [];
  let stderr: string[] = [];

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-generate-cmd'));
    await copyFixtureProject(dir);
    await mkdir(path.join(dir, 'src/navigation'), { recursive: true });
    await cp(path.join(FIXTURES_DIR, 'navigation/types.ts'), path.join(dir, 'src/navigation/types.ts'));
    await cp(path.join(FIXTURES_DIR, 'navigation/stacks.ts'), path.join(dir, 'src/navigation/stacks.ts'));
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await cleanup();
  });

  /** Parses stdout as exactly one JSON document, the contract for machine output. */
  const jsonStdout = (): JsonResult => JSON.parse(stdout.join('')) as JsonResult;

  it('prints one JSON document with the generator result on stdout and logs on stderr', async () => {
    await runCommand(generateCommand, { rawArgs: ['screen', 'Detail', '--feature', 'items', '--json', '--cwd', dir] });

    const json = jsonStdout();
    expect(Object.keys(json).sort()).toEqual(['created', 'dryRun', 'followUps', 'kind', 'ok', 'register', 'updated']);
    expect(json).toMatchObject({ ok: true, kind: 'screen', dryRun: false });
    expect([...(json.created ?? [])].sort()).toEqual([
      'src/features/items/screens/DetailScreen/DetailScreen.test.tsx',
      'src/features/items/screens/DetailScreen/DetailScreen.tsx',
      'src/features/items/screens/DetailScreen/index.ts',
      'src/features/items/screens/DetailScreen/styles.ts',
    ]);
    expect(json.updated).toEqual(expect.arrayContaining(['src/features/items/index.ts', 'src/locales/en/items.json']));
    expect(json.register?.updated).toEqual(['src/navigation/types.ts']);
    expect(json.followUps).toEqual([expect.stringContaining('--register')]);
    // Human summaries are suppressed in JSON mode; nothing else reaches stdout.
    expect(stdout.join('')).toBe(`${JSON.stringify(json, null, 2)}\n`);
    expect(stderr.join('')).toBe('');
  });

  it('reports a dry run as dryRun: true and leaves the project untouched', async () => {
    await runCommand(generateCommand, { rawArgs: ['component', 'Badge', '--json', '--dry-run', '--cwd', dir] });

    const json = jsonStdout();
    expect(json).toMatchObject({ ok: true, kind: 'component', dryRun: true, updated: [] });
    expect(json.created).toContain('src/shared/components/Badge/Badge.tsx');
    expect(await pathExists(path.join(dir, 'src/shared/components/Badge'))).toBe(false);
  });

  it('prints an ok: false error document with the error code when the run fails', async () => {
    await runCommand(generateCommand, { rawArgs: ['store', 'cart', '--feature', 'missing', '--json', '--cwd', dir] });

    expect(jsonStdout()).toEqual({
      ok: false,
      error: { code: 'FEATURE_NOT_FOUND', message: expect.stringContaining('Feature "missing" does not exist'), details: [] },
    });
    expect(process.exitCode).toBe(1);
  });
});
