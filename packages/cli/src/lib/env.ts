import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TempoEnv, TempoJson } from '@rn-tempo/contracts';

import { CliError } from './errors.ts';
import { pathExists, removePath } from './fs-utils.ts';
import { runIcons } from './icons.ts';
import { run, type Runner } from './pm.ts';
import { kebabCase } from './rename.ts';
import { readTempoJson, writeTempoJson } from './tempo-json.ts';

const ENV_NAME_RE = /^[a-z][a-z0-9]*$/;

/** Defaults for the three built-in envs; everything else derives from the app identity. */
export type EnvInput = {
  name: string;
  suffix?: string;
  displayName?: string;
  scheme?: string;
  badge?: string | null;
};

/** `qa` becomes `Qa` (Gradle variant names, iOS configuration and scheme suffixes). */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Fills in suffix, display name, scheme and badge for an env (B2 rules for custom envs). */
export function completeEnv(input: EnvInput, app: TempoJson['app']): TempoEnv {
  if (!ENV_NAME_RE.test(input.name)) {
    throw new CliError(`Invalid env name "${input.name}" (lowercase letters and digits, starting with a letter)`, {
      code: 'INVALID_ENV',
    });
  }
  const slug = kebabCase(app.name);
  return {
    name: input.name,
    suffix: input.suffix ?? (input.name === 'prod' ? '' : `.${input.name}`),
    displayName: input.displayName ?? (input.name === 'prod' ? app.displayName : `${app.displayName} ${capitalize(input.name)}`),
    scheme: input.scheme ?? (input.name === 'prod' ? slug : `${slug}-${input.name}`),
    badge: input.badge === undefined ? (input.name === 'prod' ? null : input.name.slice(0, 3).toUpperCase()) : input.badge,
  };
}

// ---------------------------------------------------------------------------------------------
// Gradle (android/app/build.gradle). The block text is identical to what the template ships.
// ---------------------------------------------------------------------------------------------

/** One `productFlavors` entry, formatted exactly like the template's. */
export function gradleFlavorBlock(env: TempoEnv): string {
  const lines = [`        ${env.name} {`, '            dimension "environment"'];
  if (env.suffix !== '') lines.push(`            applicationIdSuffix "${env.suffix}"`);
  lines.push(
    `            resValue "string", "app_name", "${env.displayName}"`,
    `            manifestPlaceholders = [deepLinkScheme: "${env.scheme}", deepLinkHost: "example.invalid"]`,
    `            buildConfigField "String", "APP_ENV", "\\"${env.name}\\""`,
    '        }',
  );
  return `${lines.join('\n')}\n`;
}

function findBlockEnd(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new CliError('android/app/build.gradle has unbalanced braces', { code: 'GRADLE_UNPARSEABLE' });
}

function flavorsRange(text: string): { start: number; end: number } {
  const open = text.indexOf('productFlavors {');
  if (open === -1) throw new CliError('productFlavors block not found in android/app/build.gradle', { code: 'GRADLE_UNPARSEABLE' });
  const braceIndex = text.indexOf('{', open);
  return { start: braceIndex, end: findBlockEnd(text, braceIndex) };
}

/** Adds a flavor, its `envConfigFiles` entry and its debuggable variant. Idempotent. */
export function addGradleFlavor(text: string, env: TempoEnv): string {
  if (new RegExp(`^ {8}${env.name} \\{`, 'm').test(text)) return text;
  const { end } = flavorsRange(text);
  const lineStart = text.lastIndexOf('\n', end) + 1;
  let next = `${text.slice(0, lineStart)}${gradleFlavorBlock(env)}${text.slice(lineStart)}`;

  next = next.replace(
    /(project\.ext\.envConfigFiles = \[\n[\s\S]*?)(\n\])/,
    `$1\n    ${env.name}debug: ".env.${env.name}", ${env.name}release: ".env.${env.name}",$2`,
  );
  next = next.replace(/debuggableVariants = \[([^\]]*)\]/, (_match, list: string) => {
    return `debuggableVariants = [${list}, "${env.name}Debug"]`;
  });
  return next;
}

/** Removes a flavor, its `envConfigFiles` entry and its debuggable variant. Idempotent. */
export function removeGradleFlavor(text: string, name: string): string {
  const block = new RegExp(`^ {8}${name} \\{\\n(?: {12}.*\\n)*? {8}\\}\\n`, 'm');
  let next = text.replace(block, '');
  next = next.replace(new RegExp(`^ {4}${name}debug: .*\\n`, 'm'), '');
  next = next.replace(/debuggableVariants = \[([^\]]*)\]/, (_match, list: string) => {
    const kept = list
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '' && item !== `"${name}Debug"`);
    return `debuggableVariants = [${kept.join(', ')}]`;
  });
  return next;
}

// ---------------------------------------------------------------------------------------------
// package.json scripts and .env files
// ---------------------------------------------------------------------------------------------

/** The run scripts of one env (B2 "Run scripts" row plus release/bundle builds). */
export function envScripts(env: TempoEnv, appName: string): Record<string, string> {
  const cap = capitalize(env.name);
  const idSuffix = env.suffix.replace(/^\./, '');
  return {
    [`android:${env.name}`]: `react-native run-android --mode ${env.name}Debug${idSuffix ? ` --appIdSuffix ${idSuffix}` : ''}`,
    [`android:${env.name}:release`]: `cd android && ./gradlew assemble${cap}Release`,
    [`android:${env.name}:bundle`]: `cd android && ./gradlew bundle${cap}Release`,
    [`ios:${env.name}`]: `react-native run-ios --scheme ${appName}-${cap} --mode Debug-${cap}`,
    [`start:${env.name}`]: 'react-native start',
  };
}

const BUILT_IN = new Set(['dev', 'staging', 'prod']);

/** Arguments for `scripts/native/ios-envs.rb`; `--meta` only covers envs the script does not know itself. */
export function iosEnvsArgs(tempo: TempoJson): string[] {
  const app = tempo.app.name;
  const pairs = tempo.envs.map((env) => `${env.name}:${capitalize(env.name)}`).join(',');
  const meta: Record<string, { display_name: string; url_scheme: string; bundle_suffix: string }> = {};
  for (const env of tempo.envs) {
    if (!BUILT_IN.has(env.name)) {
      meta[env.name] = { display_name: env.displayName, url_scheme: env.scheme, bundle_suffix: env.suffix };
    }
  }
  const args = ['--project', `ios/${app}.xcodeproj`, '--target', app, '--envs', pairs];
  if (Object.keys(meta).length > 0) args.push('--meta', JSON.stringify(meta));
  return args;
}

/** The `ios:envs` package script for the current env matrix. */
export function iosEnvsScript(tempo: TempoJson): string {
  const args = iosEnvsArgs(tempo).map((arg) => (arg.startsWith('{') ? `'${arg}'` : arg));
  return `bundle exec ruby scripts/native/ios-envs.rb ${args.join(' ')}`;
}

type Pkg = { scripts?: Record<string, string> };

async function updatePackageScripts(dir: string, update: (scripts: Record<string, string>) => void): Promise<void> {
  const file = path.join(dir, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8')) as Pkg;
  pkg.scripts ??= {};
  update(pkg.scripts);
  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Creates `.env.<name>` from `.env.example` with `APP_ENV` and `DEEP_LINK_SCHEME` set. */
export async function createEnvFile(dir: string, env: TempoEnv): Promise<boolean> {
  const target = path.join(dir, `.env.${env.name}`);
  if (await pathExists(target)) return false;
  const example = path.join(dir, '.env.example');
  if (!(await pathExists(example))) {
    await writeFile(target, `APP_ENV=${env.name}\nDEEP_LINK_SCHEME=${env.scheme}\n`);
    return true;
  }
  await copyFile(example, target);
  const text = (await readFile(target, 'utf8'))
    .replace(/^APP_ENV=.*$/m, `APP_ENV=${env.name}`)
    .replace(/^DEEP_LINK_SCHEME=.*$/m, `DEEP_LINK_SCHEME=${env.scheme}`);
  await writeFile(target, text);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------

export type EnvOptions = {
  runner?: Runner;
  json?: boolean;
  /** Skip ios-envs.rb and icons (used in tests and on machines without Ruby/Xcode). */
  skipNative?: boolean;
  /** Skip regenerating icons (batch callers run `runIcons` once at the end). */
  skipIcons?: boolean;
  /** Called with human-readable warnings (e.g. non-macOS iOS skip). */
  warn?: (message: string) => void;
};

async function editGradle(dir: string, edit: (text: string) => string): Promise<void> {
  const file = path.join(dir, 'android/app/build.gradle');
  if (!(await pathExists(file))) return;
  await writeFile(file, edit(await readFile(file, 'utf8')));
}

async function syncNative(dir: string, tempo: TempoJson, options: EnvOptions): Promise<void> {
  if (options.skipNative) return;
  const runner = options.runner ?? run;
  if (process.platform === 'darwin' && (await pathExists(path.join(dir, `ios/${tempo.app.name}.xcodeproj`)))) {
    await runner('bundle', ['exec', 'ruby', 'scripts/native/ios-envs.rb', ...iosEnvsArgs(tempo)], { cwd: dir, json: options.json });
  } else {
    options.warn?.('Skipped the iOS configuration (needs macOS and ios/): run `yarn ios:envs` on a Mac.');
  }
  if (!options.skipIcons) await runIcons(dir, { runner, json: options.json });
}

/** Adds an env to `.tempo.json`, Gradle, package scripts, `.env.<name>`, iOS configs and icons. */
export async function addEnv(dir: string, input: EnvInput, options: EnvOptions = {}): Promise<TempoEnv> {
  const tempo = await readTempoJson(dir);
  if (tempo.envs.some((env) => env.name === input.name)) {
    throw new CliError(`Env "${input.name}" already exists`, { code: 'ENV_EXISTS' });
  }
  const env = completeEnv(input, tempo.app);
  const next: TempoJson = { ...tempo, envs: [...tempo.envs, env] };
  await writeTempoJson(dir, next);
  await editGradle(dir, (text) => addGradleFlavor(text, env));
  await updatePackageScripts(dir, (scripts) => {
    Object.assign(scripts, envScripts(env, tempo.app.name));
    if ('ios:envs' in scripts) scripts['ios:envs'] = iosEnvsScript(next);
  });
  await createEnvFile(dir, env);
  await syncNative(dir, next, options);
  return env;
}

/** Removes an env everywhere `addEnv` touches, including icons, `.env.<name>` and iOS configurations. */
export async function removeEnv(dir: string, name: string, options: EnvOptions = {}): Promise<TempoEnv> {
  const tempo = await readTempoJson(dir);
  const env = tempo.envs.find((candidate) => candidate.name === name);
  if (!env) throw new CliError(`Env "${name}" does not exist`, { code: 'ENV_NOT_FOUND' });
  if (tempo.envs.length === 1) throw new CliError('Cannot remove the last env', { code: 'ENV_LAST' });
  const next: TempoJson = { ...tempo, envs: tempo.envs.filter((candidate) => candidate.name !== name) };
  await writeTempoJson(dir, next);
  await editGradle(dir, (text) => removeGradleFlavor(text, name));
  await updatePackageScripts(dir, (scripts) => {
    for (const key of Object.keys(envScripts(env, tempo.app.name))) Reflect.deleteProperty(scripts, key);
    if ('ios:envs' in scripts) scripts['ios:envs'] = iosEnvsScript(next);
  });
  const cap = capitalize(name);
  await removePath(path.join(dir, `.env.${name}`));
  await removePath(path.join(dir, `android/app/src/${name}`));
  await removePath(path.join(dir, `ios/${tempo.app.name}/Images.xcassets/AppIcon-${cap}.appiconset`));
  if (!options.skipNative && process.platform === 'darwin' && (await pathExists(path.join(dir, `ios/${tempo.app.name}.xcodeproj`)))) {
    await (options.runner ?? run)(
      'bundle',
      ['exec', 'ruby', 'scripts/native/ios-envs.rb', '--project', `ios/${tempo.app.name}.xcodeproj`, '--target', tempo.app.name, '--remove', `${name}:${cap}`],
      { cwd: dir, json: options.json },
    );
  } else if (!options.skipNative) {
    options.warn?.(`Skipped removing the iOS configuration of "${name}" (needs macOS): run \`bundle exec ruby scripts/native/ios-envs.rb --remove ${name}:${cap}\` on a Mac.`);
  }
  return env;
}

/** The env matrix of the project. */
export async function listEnvs(dir: string): Promise<TempoEnv[]> {
  return (await readTempoJson(dir)).envs;
}
