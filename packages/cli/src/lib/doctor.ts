import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadManifests } from './manifest.ts';
import { validateProjectMarkers } from './markers.ts';
import { pathExists } from './fs-utils.ts';
import { capture, type Capturer } from './pm.ts';
import { parseTempoJson } from './tempo-json.ts';

export type CheckStatus = 'ok' | 'info' | 'warn' | 'error';
export type Check = { id: string; title: string; status: CheckStatus; message: string };

export type DoctorOptions = {
  capturer?: Capturer;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  /** Skip every check that needs the network (npm registry). */
  offline?: boolean;
  /** Skip the eslint structure run (slow on big projects). */
  skipLint?: boolean;
  /** Version of this CLI, for the "latest" comparison. */
  cliVersion?: string;
};

const CONFIG_PACKAGES = ['@rn-tempo/eslint-config', '@rn-tempo/prettier-config', '@rn-tempo/tsconfig', '@rn-tempo/commitlint-config'];

/** Parses `1.2.3` (with optional leading v) into numbers; missing parts are 0. */
export function parseVersion(value: string): [number, number, number] {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value);
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)];
}

/** True when `current` is more than one minor version behind `latest` (or a major behind). */
export function isMoreThanOneMinorBehind(current: string, latest: string): boolean {
  const [cMajor, cMinor] = parseVersion(current);
  const [lMajor, lMinor] = parseVersion(latest);
  if (lMajor > cMajor) return true;
  return lMajor === cMajor && lMinor - cMinor > 1;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Runs every doctor check for the project in `dir`. Never throws; failures become `error` checks. */
export async function runDoctor(dir: string, options: DoctorOptions = {}): Promise<Check[]> {
  const exec = options.capturer ?? capture;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const checks: Check[] = [];
  const add = (id: string, title: string, status: CheckStatus, message: string) => checks.push({ id, title, status, message });

  // .tempo.json first: later checks depend on it.
  const rawTempo = await readJson(path.join(dir, '.tempo.json'));
  let tempo: ReturnType<typeof parseTempoJson> | null = null;
  if (!rawTempo) {
    add('tempo-json', '.tempo.json', 'error', 'missing or not valid JSON');
  } else {
    try {
      tempo = parseTempoJson(rawTempo);
      add('tempo-json', '.tempo.json', 'ok', `valid (app ${tempo.app.name}, template ${tempo.templateVersion})`);
    } catch (error) {
      add('tempo-json', '.tempo.json', 'error', error instanceof Error ? `${error.message}: ${(error as { details?: string[] }).details?.join('; ') ?? ''}` : 'invalid');
    }
  }

  // node vs .nvmrc
  const nvmrc = await readFile(path.join(dir, '.nvmrc'), 'utf8').catch(() => null);
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  if (nvmrc === null) add('node', 'Node.js', 'warn', 'no .nvmrc found');
  else {
    const wanted = parseVersion(nvmrc.trim())[0];
    const have = parseVersion(nodeVersion)[0];
    add('node', 'Node.js', have === wanted ? 'ok' : 'error', `${nodeVersion} (project wants ${nvmrc.trim()})`);
  }

  // yarn
  const pkg = await readJson(path.join(dir, 'package.json'));
  const yarn = await exec('yarn', ['--version'], { cwd: dir });
  const wantedYarn = typeof pkg?.packageManager === 'string' ? pkg.packageManager.replace(/^yarn@/, '') : null;
  if (yarn.exitCode !== 0) add('yarn', 'Yarn', 'error', 'yarn not found (enable corepack: corepack enable)');
  else add('yarn', 'Yarn', wantedYarn && yarn.stdout.trim() !== wantedYarn ? 'warn' : 'ok', `${yarn.stdout.trim()}${wantedYarn ? ` (packageManager ${wantedYarn})` : ''}`);

  // java
  const java = await exec('java', ['-version'], { cwd: dir });
  const javaText = `${java.stderr}\n${java.stdout}`;
  const javaMajor = parseVersion(/version "([^"]+)"/.exec(javaText)?.[1] ?? '0')[0];
  if (java.exitCode !== 0) add('java', 'Java', 'error', 'java not found (JDK 17+ required for Android)');
  else add('java', 'Java', javaMajor >= 17 ? 'ok' : 'error', javaMajor >= 17 ? `JDK ${javaMajor}` : `JDK ${javaMajor} found, 17+ required`);

  // Xcode, CocoaPods / bundler (macOS only)
  if (platform === 'darwin') {
    const xcode = await exec('xcodebuild', ['-version'], { cwd: dir });
    add('xcode', 'Xcode', xcode.exitCode === 0 ? 'ok' : 'error', xcode.exitCode === 0 ? xcode.stdout.split('\n')[0] ?? 'installed' : 'xcodebuild not found');
    const bundle = await exec('bundle', ['--version'], { cwd: dir });
    add('bundler', 'Bundler', bundle.exitCode === 0 ? 'ok' : 'error', bundle.exitCode === 0 ? bundle.stdout.trim() : 'bundle not found (gem install bundler)');
    const pod = await exec('pod', ['--version'], { cwd: dir });
    add('cocoapods', 'CocoaPods', pod.exitCode === 0 ? 'ok' : 'warn', pod.exitCode === 0 ? pod.stdout.trim() : 'pod not on PATH (use `bundle exec pod`)');
  } else {
    add('xcode', 'Xcode', 'info', 'skipped (not macOS)');
  }

  // Android SDK
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  add('android-sdk', 'Android SDK', sdk ? 'ok' : 'warn', sdk ? `ANDROID_HOME=${sdk}` : 'ANDROID_HOME / ANDROID_SDK_ROOT not set');

  // env files
  if (tempo) {
    for (const environment of tempo.envs) {
      const file = `.env.${environment.name}`;
      const present = await pathExists(path.join(dir, file));
      add(`env-${environment.name}`, file, present ? 'ok' : 'error', present ? 'present' : `missing (copy .env.example to ${file})`);
    }

    // feature markers and manifests
    const problems = await validateProjectMarkers(dir);
    add('markers', 'Feature markers', problems.length === 0 ? 'ok' : 'error', problems.length === 0 ? 'balanced' : problems.join('; '));
    const manifests = await loadManifests(dir).then(
      (loaded) => loaded,
      () => null,
    );
    if (manifests) {
      const unknown = tempo.features.filter((name) => !manifests.has(name));
      add('manifests', 'Feature manifests', unknown.length === 0 ? 'ok' : 'error', unknown.length === 0 ? `${manifests.size} manifests` : `no manifest for ${unknown.join(', ')}`);
    }
  }

  // versions on npm
  if (options.offline) {
    add('versions', 'Package versions', 'info', 'skipped (--offline)');
  } else {
    const deps = { ...(pkg?.dependencies as Record<string, string> | undefined), ...(pkg?.devDependencies as Record<string, string> | undefined) };
    for (const name of CONFIG_PACKAGES) {
      const current = deps[name];
      if (!current) continue;
      const latest = await exec('npm', ['view', name, 'version'], { cwd: dir });
      if (latest.exitCode !== 0) {
        add(`version-${name}`, name, 'info', 'could not reach the npm registry');
      } else {
        const behind = isMoreThanOneMinorBehind(current, latest.stdout.trim());
        add(`version-${name}`, name, behind ? 'warn' : 'ok', `${current} (latest ${latest.stdout.trim()})`);
      }
    }
    if (tempo && options.cliVersion) {
      const latest = await exec('npm', ['view', 'create-tempo-app', 'version'], { cwd: dir });
      if (latest.exitCode === 0 && latest.stdout.trim() !== tempo.templateVersion) {
        add('template-version', 'Template version', 'info', `project ${tempo.templateVersion}, latest ${latest.stdout.trim()}`);
      } else add('template-version', 'Template version', 'info', `project ${tempo.templateVersion}`);
    }
  }

  // file names and folder structure
  if (options.skipLint) {
    add('structure', 'File and folder rules', 'info', 'skipped (--skip-lint)');
  } else if (await pathExists(path.join(dir, 'node_modules'))) {
    const names = await exec('yarn', ['lint:files'], { cwd: dir });
    add('lint-files', 'File names (ls-lint)', names.exitCode === 0 ? 'ok' : 'error', names.exitCode === 0 ? 'clean' : (names.stderr || names.stdout).trim().split('\n').slice(0, 5).join('; '));
    const eslint = await exec('yarn', ['eslint', 'src', '--no-warn-ignored', '--format', 'json'], { cwd: dir });
    const structure = structureMessages(eslint.stdout);
    add('structure', 'Folder structure and boundaries', structure === null ? 'warn' : structure.length === 0 ? 'ok' : 'error', structure === null ? 'could not run eslint' : structure.length === 0 ? 'clean' : structure.slice(0, 5).join('; '));
  } else {
    add('structure', 'File and folder rules', 'info', 'skipped (run yarn install first)');
  }

  return checks;
}

type EslintFile = { filePath: string; messages: { ruleId: string | null; message: string }[] };

/** Only the structure and boundary rules from an eslint JSON report; null when the output is unusable. */
export function structureMessages(json: string): string[] | null {
  try {
    const files = JSON.parse(json) as EslintFile[];
    return files.flatMap((file) =>
      file.messages
        .filter((message) => message.ruleId?.startsWith('project-structure/') || message.ruleId?.startsWith('boundaries/'))
        .map((message) => `${path.basename(file.filePath)}: ${message.message}`),
    );
  } catch {
    return null;
  }
}

/** True when any check is an error (the `--ci` exit code). */
export function hasErrors(checks: readonly Check[]): boolean {
  return checks.some((check) => check.status === 'error');
}

const ICON: Record<CheckStatus, string> = { ok: 'OK', info: 'INFO', warn: 'WARN', error: 'ERROR' };

/** Markdown report for a PR comment. */
export function renderMarkdown(checks: readonly Check[]): string {
  const rows = checks.map((check) => `| ${ICON[check.status]} | ${check.title} | ${check.message.replaceAll('|', '\\|')} |`);
  const errors = checks.filter((check) => check.status === 'error').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  return [`## tempo doctor`, '', `${errors} error(s), ${warnings} warning(s)`, '', '| Status | Check | Details |', '| --- | --- | --- |', ...rows, ''].join('\n');
}
