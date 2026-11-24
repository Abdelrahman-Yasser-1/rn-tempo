import { cp, mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { downloadTemplate } from 'giget';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import command from '../src/commands/upgrade.ts';
import { createProject } from '../src/lib/create.ts';
import { addEnv } from '../src/lib/env.ts';
import { copyLocalTemplate, defaultTemplateSource } from '../src/lib/fetch-template.ts';
import { readTempoJson, writeTempoJson } from '../src/lib/tempo-json.ts';
import * as pm from '../src/lib/pm.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';
import { runJson } from './project-command.ts';

vi.mock('giget', () => ({ downloadTemplate: vi.fn() }));

describe('tempo upgrade', () => {
  let root: string;
  let base: string;
  let target: string;
  let project: string;
  let cleanup: () => Promise<void>;
  const patch = '.tempo/upgrade-0.0.0-1.0.0.patch';
  const excluded = [
    'vendor/bundle/gems/generated',
    '.env',
    '.env.dev',
    'nested/.env.staging',
    'node_modules/pkg/index.js',
    'ios/Pods/code',
    'android/app/build/code',
    '.gradle/cache',
    'android/.cxx/code',
    'DerivedData/code',
    'backend/.data/db',
    '.tempo/prior.patch',
  ];
  const lockfiles = ['Gemfile.lock', 'ios/Podfile.lock', 'yarn.lock'];

  async function file(dir: string, name: string, content: string | Buffer) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }

  async function git(...args: string[]) {
    const result = await pm.capture('git', args, { cwd: project });
    expect(result.exitCode, result.stderr).toBe(0);
    return result.stdout;
  }

  async function commit() {
    await git('add', '-A');
    await git('-c', 'user.name=Tempo', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'project');
  }

  beforeEach(async () => {
    ({ dir: root, cleanup } = await makeTempDir('tempo-upgrade-test'));
    base = path.join(root, 'base');
    target = path.join(root, 'target');
    project = path.join(root, 'project');
    await mkdir(base);
    // Only copy the inputs used by create in this fixture, including the real manifests.
    for (const name of ['package.json', '.tempo.json', '.tempo', '.env.example']) {
      await cp(path.join(TEMPLATE_DIR, name), path.join(base, name), { recursive: true });
    }
    await file(base, 'shared.md', 'TempoApp original\n');
    await file(base, 'local.md', 'old\n');
    await file(base, 'removed.md', 'gone\n');
    await file(base, 'scripts/native/icons.mjs', '');
    await file(base, '.env.dev', 'LOCAL_SETTING=old\n');
    await file(base, 'yarn.lock', 'old lockfile\n');
    await copyLocalTemplate(base, target);
    await writeTempoJson(target, { ...(await readTempoJson(target)), templateVersion: '1.0.0' });
    await file(target, 'shared.md', 'TempoApp updated\n');
    await file(target, 'local.md', 'upstream\n');
    await file(target, 'src/assets/icons/new icon.png', Buffer.from([0, 1, 255]));
    await file(target, '.env.example', 'NEW_KEY=value\n');
    await file(target, 'src/services/cms/disabled.ts', 'disabled feature\n');
    for (const name of [...excluded, ...lockfiles]) await file(target, name, 'excluded content\n');
    await rm(path.join(target, 'removed.md'));

    // Each version is fetched through the real local/remote dispatch. Only the download is substituted.
    vi.mocked(downloadTemplate).mockImplementation(async (source, options) => {
      const release = source === defaultTemplateSource('0.0.0') ? base : target;
      if (!options?.dir || ![defaultTemplateSource('0.0.0'), defaultTemplateSource('1.0.0')].includes(source))
        throw new Error('unknown release');
      await copyLocalTemplate(release, options.dir);
      return { dir: options.dir, source };
    });
    await createProject({
      dir: project,
      cwd: root,
      template: base,
      name: 'AcmeShop',
      displayName: 'Acme',
      bundleId: 'io.acme.shop',
      envs: [{ name: 'qa', badge: 'QA' }],
      features: [],
      cliVersion: '0.0.0',
      git: false,
      install: false,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await cleanup();
  });

  it('AC-1: previews a project-relative binary patch with personalized sources and a lockfile summary', async () => {
    // Keep dev in this matrix so its changed .env.dev reaches the patch exclusion step.
    await addEnv(project, { name: 'dev' }, { skipNative: true });
    const { result, stderr, exitCode } = await runJson(command, project, '--template', '../target');
    expect(exitCode, stderr).toBe(0);
    expect(result).toEqual({
      ok: true,
      from: '0.0.0',
      to: '1.0.0',
      patch,
      applied: false,
      conflicts: [],
      lockfiles,
      added: ['src/assets/icons/new icon.png'],
      changed: ['.env.example', 'local.md', 'package.json', 'shared.md'],
      removed: ['removed.md'],
    });
    expect(stderr).toContain('Reinstall to refresh');
    expect(stderr).toContain('/docs/cli/upgrade');
    const contents = await readFile(path.join(project, patch), 'utf8');
    for (const name of [...excluded.filter((name) => name !== '.env'), ...lockfiles]) expect(contents).not.toContain(name);
    expect(contents).not.toContain('excluded content');
    expect(contents).toContain('diff --git a/shared.md b/shared.md');
    expect(contents).toContain('+AcmeShop updated');
    expect(contents).toContain('GIT binary patch');
    expect((await readTempoJson(project)).templateVersion).toBe('0.0.0');
  });

  it('AC-1: applies additions, changes, removals and the version bump in a clean nested project', async () => {
    await git('init', '-q', root);
    // Keep the two template sources outside the index in this fixture monorepo.
    await file(root, '.git/info/exclude', '/base/\n/target/\n');
    await commit();
    const { result, stderr, exitCode } = await runJson(command, project, '--template', target, '--apply');
    expect(exitCode, stderr).toBe(0);
    expect(result).toMatchObject({ ok: true, applied: true, conflicts: [] });
    expect(await readFile(path.join(project, 'shared.md'), 'utf8')).toBe('AcmeShop updated\n');
    expect(await readFile(path.join(project, 'src/assets/icons/new icon.png'))).toEqual(Buffer.from([0, 1, 255]));
    await expect(readFile(path.join(project, 'removed.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readTempoJson(project)).toMatchObject({ templateVersion: '1.0.0', createdWith: 'create-tempo-app@0.0.0' });
  });

  it.skipIf(process.platform === 'win32')('AC-1: preserves relative symlink targets across temporary template copies', async () => {
    await symlink('local.md', path.join(base, 'link'));
    await symlink('local.md', path.join(project, 'link'));
    await symlink('shared.md', path.join(target, 'link'));
    await git('init', '-q');
    await commit();
    const { result, stderr, exitCode } = await runJson(command, project, '--template', target, '--apply');
    expect(exitCode, stderr).toBe(0);
    expect(result).toMatchObject({ applied: true, changed: expect.arrayContaining(['link']) });
    expect(await readlink(path.join(project, 'link'))).toBe('shared.md');
  });

  it('AC-1: merges independent local and release edits using the reconstructed base blob', async () => {
    const originalLines = ['base title', 'line 2', 'line 3', 'line 4', 'line 5', 'base footer'];
    await file(base, 'local.md', originalLines.join('\n') + '\n');
    await file(target, 'local.md', ['release title', ...originalLines.slice(1)].join('\n') + '\n');
    await file(project, 'local.md', [...originalLines.slice(0, -1), 'project footer'].join('\n') + '\n');
    await git('init', '-q');
    await commit();
    const { result, exitCode, stderr } = await runJson(command, project, '--to', '1.0.0', '--apply');
    expect(exitCode, stderr).toBe(0);
    expect(result).toMatchObject({ ok: true, applied: true, conflicts: [] });
    expect(await readFile(path.join(project, 'local.md'), 'utf8')).toBe(
      ['release title', ...originalLines.slice(1, -1), 'project footer'].join('\n') + '\n',
    );
  });

  it('AC-1: leaves conflict markers and all three index stages when the initial commit already contains local edits', async () => {
    await git('init', '-q');
    await file(project, 'local.md', 'my changes\n');
    await commit();
    const { result, exitCode, stderr } = await runJson(command, project, '--template', target, '--apply');
    expect(exitCode, stderr).toBe(1);
    expect(result).toMatchObject({ ok: false, applied: false, conflicts: ['local.md'] });
    expect(await git('show', ':1:local.md')).toBe('old');
    expect(await git('show', ':2:local.md')).toBe('my changes');
    expect(await git('show', ':3:local.md')).toBe('upstream');
    expect(await readFile(path.join(project, 'local.md'), 'utf8')).toContain('<<<<<<<');
    expect((await readTempoJson(project)).templateVersion).toBe('0.0.0');
  });

  it('AC-1: rejects a non-repository and an untracked change before writing a patch', async () => {
    const apply = () => runJson(command, project, '--template', target, '--apply');
    expect((await apply()).result).toMatchObject({ error: { code: 'UPGRADE_DIRTY_TREE' } });
    await git('init', '-q');
    await commit();
    await file(project, 'untracked', 'work');
    expect((await apply()).result).toMatchObject({ error: { code: 'UPGRADE_DIRTY_TREE' } });
    await expect(readFile(path.join(project, patch))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('AC-1: returns an empty summary for the current release from npm, --to or --template', async () => {
    vi.spyOn(pm, 'latestRelease').mockResolvedValue({ stdout: '0.0.0', stderr: '', exitCode: 0 });
    for (const args of [[], ['--to', '0.0.0'], ['--template', base]]) {
      const { result, stderr, exitCode } = await runJson(command, project, ...args);
      expect(exitCode, stderr).toBe(0);
      expect(stderr).toMatch(/already up to date/i);
      expect(result).toMatchObject({ ok: true, patch: null, applied: false, changed: [], from: '0.0.0', to: '0.0.0' });
    }
  });

  it('AC-1: reports missing project, unavailable release, failed registry lookup and missing Git', async () => {
    expect((await runJson(command, root)).result).toMatchObject({ error: { code: 'NOT_A_TEMPO_PROJECT' } });
    expect((await runJson(command, project, '--to', '9.9.9')).result).toMatchObject({ error: { code: 'TEMPLATE_DOWNLOAD_FAILED' } });
    vi.spyOn(pm, 'latestRelease').mockResolvedValue({ stdout: '', stderr: 'offline', exitCode: 1 });
    expect((await runJson(command, project)).result).toMatchObject({ error: { code: 'UPGRADE_LATEST_FAILED' } });
    vi.stubEnv('PATH', '');
    expect((await runJson(command, project, '--template', target, '--apply')).result).toMatchObject({ error: { code: 'GIT_MISSING' } });
  });
});
