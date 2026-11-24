import { copyFile, mkdir, mkdtemp, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { TempoJson } from '@rn-tempo/contracts';

import { configureFetchedProject } from './create.ts';
import { CliError } from './errors.ts';
import { fetchTemplate } from './fetch-template.ts';
import { IGNORED_DIRS, pathExists } from './fs-utils.ts';
import { packageRoot } from './generate.ts';
import { capture, latestRelease, run, type Runner } from './pm.ts';
import { readTempoJson, TEMPO_JSON, writeTempoJson } from './tempo-json.ts';

type UpgradeOptions = { cwd: string; to?: string; template?: string; apply?: boolean; json?: boolean };
type Changes = { added: string[]; changed: string[]; removed: string[]; lockfiles: string[] };
type UpgradeResult = Changes & { ok: boolean; from: string; to: string; patch: string | null; applied: boolean; conflicts: string[] };

const locks = ['yarn.lock', 'Gemfile.lock', 'Podfile.lock'];

async function git(cwd: string, args: string[], env?: Record<string, string>) {
  const result = await capture('git', args, { cwd, env });
  if (result.exitCode === 127) throw new CliError('Install Git to generate or apply an upgrade patch.', { code: 'GIT_MISSING' });
  return result;
}

async function checkedGit(cwd: string, args: string[], env?: Record<string, string>) {
  const result = await git(cwd, args, env);
  if (result.exitCode !== 0) throw new CliError(result.stderr || 'Git could not generate the patch.', { code: 'UPGRADE_GIT_FAILED' });
  return result.stdout;
}

async function cleanTree(cwd: string) {
  const status = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status.exitCode !== 0 || status.stdout) {
    throw new CliError('Applying an upgrade requires a Git working tree with all changes committed or stashed.', {
      code: 'UPGRADE_DIRTY_TREE',
    });
  }
}

// Source walks for renaming skip icons. A release diff must include those binary assets too.
async function snapshotFiles(dir: string, parent = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(dir, parent), { withFileTypes: true })) {
    const name = entry.name;
    const rel = parent ? parent + '/' + name : name;
    if (
      IGNORED_DIRS.has(name) ||
      rel === 'vendor/bundle' ||
      rel === 'backend/.data' ||
      rel === '.ai/sessions' ||
      rel === '.ai/.current.json'
    )
      continue;
    if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) continue;
    if (parent === '.tempo' && name.endsWith('.patch')) continue;
    // Project-owned metadata is updated only after the entire patch has applied.
    if (rel === TEMPO_JSON) continue;
    if (entry.isDirectory()) files.push(...(await snapshotFiles(dir, rel)));
    else files.push(rel);
  }
  return files;
}

/** One disposable index for both trees. On apply, keep the ancestor blobs for Git's conflict stages. */
async function snapshot(dir: string, gitDir: string, env: Record<string, string>) {
  const args = ['--git-dir', gitDir, '--work-tree', dir];
  const list = path.join(gitDir, 'paths');
  await writeFile(list, (await snapshotFiles(dir)).join('\0') + '\0');
  await checkedGit(dir, [...args, 'read-tree', '--empty'], env);
  await checkedGit(dir, [...args, '--literal-pathspecs', 'add', '-f', '--pathspec-from-file=' + list, '--pathspec-file-nul'], env);
  return checkedGit(dir, [...args, 'write-tree'], env);
}

// Native env scripts use the project's installed gems and generate reproducible Xcode IDs.
function snapshotRunner(projectDir: string): Runner {
  return async (command, args, options) => {
    if (command !== 'bundle' || args[2] !== 'scripts/native/ios-envs.rb') return run(command, args, options);
    const preload = path.join(await packageRoot(), 'templates/upgrade/snapshot-uuids.rb');
    return run(command, [...args.slice(0, 2), '-r', preload, ...args.slice(2)], {
      ...options,
      env: { ...options.env, BUNDLE_FROZEN: 'true', BUNDLE_GEMFILE: path.join(projectDir, 'Gemfile') },
    });
  };
}

async function prepare(dir: string, project: TempoJson, version: string, source: string, options: UpgradeOptions) {
  await configureFetchedProject(
    {
      dir,
      cwd: options.cwd,
      ...project.app,
      envs: project.envs,
      features: project.features,
      logPrompts: project.ai.logPrompts,
      cliVersion: version,
      git: false,
      install: false,
      json: options.json,
      runner: snapshotRunner(path.resolve(options.cwd)),
    },
    source,
  );
}

async function publishPatch(cwd: string, patch: string, source: string) {
  const dir = path.join(cwd, '.tempo');
  await mkdir(dir, { recursive: true });
  const resolved = await realpath(dir);
  if (resolved !== cwd && !resolved.startsWith(cwd + path.sep)) throw new CliError('The patch directory must be inside the project.', { code: 'UPGRADE_PATCH_PATH' });
  const staging = await mkdtemp(path.join(dir, '.upgrade-'));
  try {
    const file = path.join(staging, 'patch');
    await copyFile(source, file);
    await rename(file, path.join(cwd, patch));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function upgrade(options: UpgradeOptions): Promise<UpgradeResult> {
  const project = await readTempoJson(options.cwd);
  const cwd = await realpath(options.cwd);
  const from = project.templateVersion;
  let requested = options.to;
  if (!requested && !options.template) {
    const latest = await latestRelease(cwd);
    if (latest.exitCode !== 0 || !latest.stdout.trim())
      throw new CliError('Could not resolve the latest create-tempo-app release from npm.', { code: 'UPGRADE_LATEST_FAILED' });
    requested = latest.stdout.trim();
  }
  const tmp = await mkdtemp(path.join(tmpdir(), 'tempo-upgrade-'));
  try {
    const target = path.join(tmp, 'target');
    const base = path.join(tmp, 'base');
    const result: UpgradeResult = {
      ok: true,
      from,
      to: from,
      patch: null,
      added: [],
      changed: [],
      removed: [],
      lockfiles: [],
      applied: false,
      conflicts: [],
    };
    if (!options.template && requested === from) return result;
    const fetched = await fetchTemplate({ cwd, cliVersion: requested ?? from, dest: target, template: options.template });
    const to = (await readTempoJson(target)).templateVersion;
    if (requested !== undefined && requested !== to)
      throw new CliError(`Requested template ${requested}, but the source declares ${to}.`, { code: 'UPGRADE_VERSION_MISMATCH' });
    result.to = to;
    if (to === from) return result;

    if (options.apply) await cleanTree(cwd);
    const gitDir = path.join(tmp, 'diff.git');
    const env: Record<string, string> = { GIT_INDEX_FILE: path.join(gitDir, 'index') };
    const initArgs = ['init', '--bare', '--quiet'];
    // Binary patch object IDs must use the destination repository's hash format, including for previews.
    const format = await git(cwd, ['rev-parse', '--show-object-format']);
    if (format.exitCode === 0) initArgs.push('--object-format=' + format.stdout);
    if (options.apply) {
      env.GIT_OBJECT_DIRECTORY = await checkedGit(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'objects']);
    }
    await checkedGit(tmp, [...initArgs, gitDir]);
    const original = await fetchTemplate({ cwd, cliVersion: from, dest: base });
    if ((await readTempoJson(base)).templateVersion !== from)
      throw new CliError(`The base template does not declare version ${from}.`, { code: 'UPGRADE_VERSION_MISMATCH' });
    // Env-specific icon generation can use the project's installed dependencies without installing in either copy.
    const modules = path.join(cwd, 'node_modules');
    if (await pathExists(modules)) await symlink(modules, path.join(tmp, 'node_modules'), 'junction');
    await prepare(base, project, from, original.source, options);
    await prepare(target, project, to, fetched.source, options);
    const before = await snapshot(base, gitDir, env);
    const after = await snapshot(target, gitDir, env);
    const diff = ['--git-dir', gitDir, 'diff', '--no-color', '--no-renames', '--no-ext-diff', '--no-textconv', before, after];
    const fields = (await checkedGit(tmp, [...diff, '--name-status', '-z'], env)).split('\0');
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const file = fields[i + 1]!;
      if (locks.includes(path.posix.basename(file))) result.lockfiles.push(file);
      else if (fields[i] === 'A') result.added.push(file);
      else if (fields[i] === 'D') result.removed.push(file);
      else result.changed.push(file);
    }
    const patch = `.tempo/upgrade-${from}-${to}.patch`;
    const output = path.join(tmp, 'upgrade.patch');
    await checkedGit(
      tmp,
      [
        ...diff,
        '--binary',
        '--full-index',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--output=' + output,
        '--',
        ...locks.map((name) => ':(exclude,glob)**/' + name),
      ],
      env,
    );
    if (options.apply) await cleanTree(cwd);
    await publishPatch(cwd, patch, output);
    result.patch = patch;
    if (!options.apply) return result;

    if (result.added.length + result.changed.length + result.removed.length > 0) {
      const prefix = await checkedGit(cwd, ['rev-parse', '--show-prefix']);
      const root = await checkedGit(cwd, ['rev-parse', '--show-toplevel']);
      const applied = await git(root, [
        'apply',
        '--3way',
        ...(prefix ? ['--directory=' + prefix.replace(/\/$/, '')] : []),
        path.join(cwd, patch),
      ]);
      if (applied.exitCode !== 0) {
        result.conflicts = (await checkedGit(cwd, ['diff', '--relative', '--name-only', '--diff-filter=U', '-z', '--', '.']))
          .split('\0')
          .filter(Boolean);
        if (!result.conflicts.length) throw new CliError(applied.stderr, { code: 'UPGRADE_APPLY_FAILED' });
        return { ...result, ok: false };
      }
    }
    await writeTempoJson(cwd, { ...(await readTempoJson(cwd)), templateVersion: to });
    return { ...result, applied: true };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
