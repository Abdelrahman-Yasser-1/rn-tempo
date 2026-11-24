import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import spec from '../src/commands/spec.ts';
import { pathExists } from '../src/lib/fs-utils.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';
import { runJson } from './project-command.ts';

describe('tempo spec', () => {
  let dir: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => { ({ dir, cleanup } = await makeTempDir('tempo-spec')); });
  afterEach(async () => { await cleanup(); });

  it('AC-1: previews and copies the project templates and preserves existing specs', async () => {
    await cp(path.join(TEMPLATE_DIR, 'specs/_templates'), path.join(dir, 'specs/_templates'), { recursive: true });
    await writeFile(path.join(dir, 'specs/_templates/design.md'), 'Project design template');
    const created = ['design', 'spec', 'tasks'].map((file) => `specs/new-feature/${file}.md`);
    const run = (...args: string[]) => runJson(spec, dir, 'new', 'new-feature', ...args);
    expect((await run('--dry-run')).result).toEqual({ ok: true, name: 'new-feature', dryRun: true, created });
    expect(await pathExists(path.join(dir, 'specs/new-feature'))).toBe(false);
    expect((await run()).result).toEqual({ ok: true, name: 'new-feature', dryRun: false, created });
    const design = path.join(dir, created[0]!);
    expect(await readFile(design, 'utf8')).toBe('Project design template');
    await writeFile(design, 'Edited design');
    expect(await run()).toMatchObject({ exitCode: 1, result: { ok: false, error: { code: 'SPEC_EXISTS' } } });
    expect(await readFile(design, 'utf8')).toBe('Edited design');
  });

  it.each(['../escape', 'BadName', 'too--many'])('AC-1: rejects invalid spec name %s', async (name) => {
    expect(await runJson(spec, dir, 'new', name)).toMatchObject({ exitCode: 1, result: { error: { code: 'INVALID_SPEC_NAME' } } });
  });

  it('AC-1: reports missing project scripts and templates', async () => {
    expect((await runJson(spec, dir, 'check')).result).toMatchObject({ ok: false, error: { code: 'SPEC_SCRIPT_MISSING' } });
    expect((await runJson(spec, dir, 'new', 'wallet')).result).toMatchObject({ ok: false, error: { code: 'SPEC_TEMPLATES_MISSING' } });
  });

  it('AC-1: preserves coverage details and the checker exit status', async () => {
    const script = 'scripts/spec-check.mjs';
    await cp(path.join(TEMPLATE_DIR, script), path.join(dir, script));
    await cp(path.join(TEMPLATE_DIR, 'specs/_templates/spec.md'), path.join(dir, 'specs/wallet/spec.md'));
    const row = { feature: 'wallet', status: 'draft', total: 1, uncovered: ['AC-1'], enforced: false };
    expect(await runJson(spec, dir, 'check')).toMatchObject({ exitCode: 0, result: { ok: true, specs: [row] } });
    expect(await runJson(spec, dir, 'check', '--strict')).toMatchObject({
      exitCode: 1, result: { ok: false, specs: [{ ...row, enforced: true }] },
    });
    await writeFile(path.join(dir, script), 'process.stdout.write("checker failed"); process.exitCode = 7;');
    expect(await runJson(spec, dir, 'check')).toEqual({ exitCode: 7, stderr: expect.stringContaining('checker failed'), result: { ok: false, exitCode: 7 } });
  });
});
