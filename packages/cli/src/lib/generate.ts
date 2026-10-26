import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliError } from './errors.ts';
import { assertInsideProject, pathExists } from './fs-utils.ts';

export type GenerateKind = 'feature' | 'screen' | 'component' | 'hook' | 'store' | 'query';

/** Placeholder values available to template files and file names. */
export type TemplateVars = {
  /** camelCase, e.g. `walletCard` */
  name: string;
  /** PascalCase, e.g. `WalletCard` */
  Name: string;
  /** kebab-case, e.g. `wallet-card` */
  name_kebab: string;
  /** UPPER_SNAKE, e.g. `WALLET_CARD` */
  NAME_UPPER: string;
  /** kebab-case feature the file belongs to */
  feature: string;
  featureCamel: string;
  FeatureName: string;
  FEATURE_UPPER: string;
  /** ISO date (yyyy-mm-dd) */
  date: string;
};

function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== '');
}

/** `wallet-card` / `walletCard` / `WalletCard` become `WalletCard`. */
export function toPascal(input: string): string {
  return words(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** `WalletCard` becomes `walletCard`. */
export function toCamel(input: string): string {
  const pascal = toPascal(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `WalletCard` becomes `wallet-card`. */
export function toKebab(input: string): string {
  return words(input)
    .map((word) => word.toLowerCase())
    .join('-');
}

/** `WalletCard` becomes `WALLET_CARD`. */
export function toUpperSnake(input: string): string {
  return toKebab(input).replaceAll('-', '_').toUpperCase();
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?:[-_ ][A-Za-z0-9]+)*$/;

/** Rejects names that cannot become identifiers or folder names. */
export function assertValidName(name: string, what: string): void {
  if (!NAME_RE.test(name) || words(name).length === 0) {
    throw new CliError(`Invalid ${what} "${name}": use letters and digits, e.g. wallet-card or WalletCard`, { code: 'INVALID_NAME' });
  }
}

/** Builds the placeholder values for a name inside a feature. */
export function buildVars(name: string, feature: string, date = new Date()): TemplateVars {
  assertValidName(name, 'name');
  assertValidName(feature, 'feature name');
  return {
    name: toCamel(name),
    Name: toPascal(name),
    name_kebab: toKebab(name),
    NAME_UPPER: toUpperSnake(name),
    feature: toKebab(feature),
    featureCamel: toCamel(feature),
    FeatureName: toPascal(feature),
    FEATURE_UPPER: toUpperSnake(feature),
    date: date.toISOString().slice(0, 10),
  };
}

/** Replaces `{{key}}` placeholders; an unknown key is an error, never silently left in the output. */
export function render(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (vars as Record<string, string>)[key];
    if (value === undefined) throw new CliError(`Unknown template placeholder {{${key}}}`, { code: 'TEMPLATE_PLACEHOLDER' });
    return value;
  });
}

/** Root of the installed package (works from `src/` in tests and from `dist/` once built). */
export async function packageRoot(from = fileURLToPath(import.meta.url)): Promise<string> {
  let current = path.dirname(from);
  for (let depth = 0; depth < 6; depth += 1) {
    if (await pathExists(path.join(current, 'templates')) && (await pathExists(path.join(current, 'package.json')))) return current;
    current = path.dirname(current);
  }
  throw new CliError('Could not locate the CLI templates folder', { code: 'TEMPLATES_MISSING' });
}

/** Which template folder to use: the project's `.tempo/templates/<dir>` wins over the built-in one. */
export async function resolveTemplateDir(projectDir: string, dirName: string, builtInRoot?: string): Promise<{ dir: string; source: 'project' | 'built-in' }> {
  const override = path.join(projectDir, '.tempo/templates', dirName);
  if (await pathExists(override)) return { dir: override, source: 'project' };
  const root = builtInRoot ?? path.join(await packageRoot(), 'templates');
  const dir = path.join(root, dirName);
  if (!(await pathExists(dir))) throw new CliError(`No template for "${dirName}"`, { code: 'TEMPLATES_MISSING' });
  return { dir, source: 'built-in' };
}

async function listFiles(dir: string, base = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of (await readdir(path.join(dir, base), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

export type RenderOptions = {
  projectDir: string;
  /** Template folder name under `templates/` (e.g. `component-shared`). */
  dirName: string;
  vars: TemplateVars;
  force?: boolean;
  dryRun?: boolean;
  builtInRoot?: string;
  /** Return true to skip a rendered project-relative path. */
  skip?: (relPath: string) => boolean;
};

export type RenderResult = { created: string[]; templateSource: 'project' | 'built-in' };

/**
 * Renders one template folder into the project. File names and contents are rendered, `.tmpl` is
 * stripped, and an existing file is an error unless `force` is set. Nothing is written when any
 * target exists, so a failed run never leaves a half-generated tree.
 */
export async function renderTemplateDir(options: RenderOptions): Promise<RenderResult> {
  const { dir, source } = await resolveTemplateDir(options.projectDir, options.dirName, options.builtInRoot);
  const plan: { rel: string; text: string }[] = [];
  for (const file of await listFiles(dir)) {
    const rel = render(file.replace(/\.tmpl$/, ''), options.vars);
    assertInsideProject(rel, 'generated path');
    if (options.skip?.(rel)) continue;
    plan.push({ rel, text: render(await readFile(path.join(dir, file), 'utf8'), options.vars) });
  }
  const existing: string[] = [];
  for (const item of plan) if (await pathExists(path.join(options.projectDir, item.rel))) existing.push(item.rel);
  if (existing.length > 0 && !options.force) {
    throw new CliError('Refusing to overwrite existing files (use --force)', { code: 'FILE_EXISTS', details: existing });
  }
  if (!options.dryRun) {
    for (const item of plan) {
      const target = path.join(options.projectDir, item.rel);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, item.text);
    }
  }
  return { created: plan.map((item) => item.rel), templateSource: source };
}

/** True when the project exists as a directory. */
export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}
