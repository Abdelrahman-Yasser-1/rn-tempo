import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ai from '../src/commands/ai.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';
import { runJson } from './project-command.ts';

describe('tempo ai', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => { ({ dir, cleanup } = await makeTempDir('tempo-ai')); });
  afterEach(async () => { await cleanup(); });

  it('AC-1: checks, syncs and prunes using the project module and selected tools', async () => {
    await cp(path.join(TEMPLATE_DIR, 'scripts/ai-sync/sync.mjs'), path.join(dir, 'scripts/ai-sync/sync.mjs'));
    await mkdir(path.join(dir, 'ai/rules'), { recursive: true });
    const source = path.join(dir, 'ai/rules/example.md');
    const output = '.cursor/rules/example.mdc';
    await writeFile(source, '# Example');
    await writeFile(path.join(dir, '.tempo.json'), JSON.stringify({ ai: { tools: ['claude'] } }));
    expect((await runJson(ai, dir, 'sync')).result).toEqual({ ok: true, check: false, written: [], removed: [] });

    const sync = (...args: string[]) => runJson(ai, dir, 'sync', '--tools', 'cursor', ...args);
    expect(await sync('--check')).toEqual({
      result: { ok: false, check: true, written: [output], removed: [] }, stderr: expect.stringContaining(output), exitCode: 1,
    });
    expect(await pathExists(path.join(dir, output))).toBe(false);
    expect((await sync()).result).toEqual({ ok: true, check: false, written: [output], removed: [] });
    expect((await sync('--check')).result).toEqual({ ok: true, check: true, written: [], removed: [] });
    await rm(source);
    expect((await sync()).result).toEqual({ ok: true, check: false, written: [], removed: [output] });
    expect(await pathExists(path.join(dir, output))).toBe(false);
  });

  it('AC-1: passes the history window to the project report and keeps human output on stderr', async () => {
    for (const file of ['report.mjs', 'lib.mjs']) {
      const relative = `scripts/ai-log/${file}`;
      await cp(path.join(TEMPLATE_DIR, relative), path.join(dir, relative));
    }
    const report = await runJson(ai, dir, 'report', '--since', '7d');
    expect(report.result).toEqual({ ok: true, summary: expect.stringContaining('Commits since 7d:') });
    expect(report.stderr).toContain('Commits since 7d:');
    expect(report.exitCode).toBe(0);
  });

  it.each(['sync', 'report'])('AC-1: explains a missing project script for %s', async (command) => {
    expect(await runJson(ai, dir, command)).toMatchObject({
      result: { ok: false, error: { code: 'AI_SCRIPTS_MISSING', message: expect.stringContaining('predate') } }, exitCode: 1,
    });
  });
});
