import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertInsideProject, isTextFile, pathExists, pruneEmptyDirs, walk } from './fs-utils.ts';

/** The identity of an app: what `rename` replaces and what it replaces it with. */
export type AppIdentity = {
  name: string;
  displayName: string;
  bundleId: string;
  /** Per-env display name and URL scheme, keyed by env name. */
  envs: Readonly<Record<string, { displayName: string; scheme: string }>>;
};

export type RenameResult = {
  rewrittenFiles: string[];
  movedPaths: { from: string; to: string }[];
};

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
const BUNDLE_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

/** App name validation shared by prompts and `rename` (PascalCase, ASCII). */
export function isValidAppName(value: string): boolean {
  return NAME_RE.test(value);
}

/** Reverse-DNS bundle id validation (lowercase segments, at least two). */
export function isValidBundleId(value: string): boolean {
  return BUNDLE_RE.test(value);
}

/** `MyCoolApp` becomes `my-cool-app` (package name, default URL scheme). */
export function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

type Rule = { source: string; replacement: string };

/**
 * Builds a single-pass replacer (longest literal first) so output is never replaced again.
 * `bounded` literals only match when not glued to other letters or digits.
 */
function buildReplacer(rules: readonly Rule[], bounded: (rule: Rule) => boolean, guard: string): ((text: string) => string) | null {
  const unique = new Map<string, Rule>();
  for (const rule of rules) if (rule.source !== rule.replacement) unique.set(rule.source, rule);
  const ordered = [...unique.values()].sort((a, b) => b.source.length - a.source.length);
  if (ordered.length === 0) return null;
  const pattern = ordered
    .map((rule) => {
      const literal = escapeRegExp(rule.source);
      return bounded(rule) ? `((?<!${guard})${literal}(?!${guard}))` : `(${literal})`;
    })
    .join('|');
  const regex = new RegExp(pattern, 'g');
  return (text) =>
    text.replace(regex, (...args: unknown[]) => {
      const groups = args.slice(1, 1 + ordered.length) as (string | undefined)[];
      const index = groups.findIndex((group) => group !== undefined);
      return ordered[index]?.replacement ?? '';
    });
}

/** Files whose content may contain URL schemes (kept narrow so prose is never touched). */
function isSchemeFile(rel: string): boolean {
  const base = rel.split('/').pop() ?? '';
  return (
    base.endsWith('.xcconfig') ||
    base.endsWith('.gradle') ||
    base === 'ios-envs.rb' ||
    base === 'icons.mjs' ||
    base.startsWith('.env')
  );
}

function schemeRules(from: AppIdentity, to: AppIdentity): Rule[] {
  const rules: Rule[] = [];
  for (const [env, source] of Object.entries(from.envs)) {
    const target = to.envs[env];
    if (target) rules.push({ source: source.scheme, replacement: target.scheme });
  }
  return rules;
}

/** Content rules: bundle id, bundle path, app identifier, then display names (longest wins). */
function contentRules(from: AppIdentity, to: AppIdentity): Rule[] {
  const rules: Rule[] = [
    { source: from.bundleId, replacement: to.bundleId },
    { source: from.bundleId.replaceAll('.', '/'), replacement: to.bundleId.replaceAll('.', '/') },
    { source: from.name, replacement: to.name },
    { source: from.displayName, replacement: to.displayName },
  ];
  for (const [env, source] of Object.entries(from.envs)) {
    const target = to.envs[env];
    if (target) rules.push({ source: source.displayName, replacement: target.displayName });
  }
  return rules;
}

/** Updates the `name` field of package.json text from `tempo-app` style to the new kebab name. */
function renamePackageName(text: string, fromName: string, toName: string): string {
  return text.replace(new RegExp(`("name"\\s*:\\s*)"${escapeRegExp(kebabCase(fromName))}"`), `$1"${kebabCase(toName)}"`);
}

/**
 * Renames an app in place: file contents (single pass, longest match first), schemes (only in
 * xcconfig, gradle, ios-envs.rb, icons.mjs and `.env*` files), then folders and files named after
 * the app and the Android source directories. `.tempo.json` is left to the caller, which rewrites it.
 */
export async function renameProject(root: string, from: AppIdentity, to: AppIdentity): Promise<RenameResult> {
  if (!isValidAppName(to.name)) throw new Error(`Invalid app name "${to.name}" (PascalCase letters and digits)`);
  if (!isValidBundleId(to.bundleId)) throw new Error(`Invalid bundle id "${to.bundleId}" (reverse-DNS, lowercase)`);
  assertInsideProject(to.bundleId.replaceAll('.', '/'), 'bundle id path');
  assertInsideProject(to.name, 'app name');

  const isWord = (rule: Rule) => /^[A-Za-z0-9 ]+$/.test(rule.source) && rule.source !== from.name;
  const replaceContent = buildReplacer(contentRules(from, to), isWord, '[A-Za-z0-9]');
  const replaceSchemes = buildReplacer(schemeRules(from, to), () => true, '[A-Za-z0-9_.-]');
  const rewrittenFiles: string[] = [];

  for (const entry of await walk(root)) {
    if (entry.isDir || entry.rel === '.tempo.json') continue;
    const absolute = path.join(root, entry.rel);
    if (!(await isTextFile(absolute))) continue;
    const text = await readFile(absolute, 'utf8');
    let next = replaceContent ? replaceContent(text) : text;
    if (replaceSchemes && isSchemeFile(entry.rel)) next = replaceSchemes(next);
    if (entry.rel === 'package.json') next = renamePackageName(next, from.name, to.name);
    if (entry.rel === 'yarn.lock') {
      next = next.replaceAll(`"${kebabCase(from.name)}@workspace`, `"${kebabCase(to.name)}@workspace`);
    }
    if (next !== text) {
      await writeFile(absolute, next);
      rewrittenFiles.push(entry.rel);
    }
  }

  return { rewrittenFiles, movedPaths: await movePaths(root, from, to) };
}

async function move(root: string, fromRel: string, toRel: string): Promise<void> {
  assertInsideProject(toRel, 'rename target');
  const target = path.join(root, toRel);
  if (await pathExists(target)) throw new Error(`Cannot rename ${fromRel}: ${toRel} already exists`);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(path.join(root, fromRel), target);
}

async function movePaths(root: string, from: AppIdentity, to: AppIdentity): Promise<{ from: string; to: string }[]> {
  const moved: { from: string; to: string }[] = [];
  const fromPath = from.bundleId.replaceAll('.', '/');
  const toPath = to.bundleId.replaceAll('.', '/');

  // 1. Android source dirs: .../java/com/old/app -> .../java/com/new/app
  if (fromPath !== toPath) {
    const dirs = (await walk(root)).filter((entry) => entry.isDir && entry.rel.endsWith(`/${fromPath}`));
    for (const dir of dirs) {
      const target = `${dir.rel.slice(0, -fromPath.length)}${toPath}`;
      await move(root, dir.rel, target);
      await pruneEmptyDirs(root, path.dirname(path.join(root, dir.rel)));
      moved.push({ from: dir.rel, to: target });
    }
  }

  // 2. Anything named after the app identifier (ios/TempoApp, TempoApp.xcodeproj, TempoApp-Dev.xcscheme ...).
  if (from.name !== to.name) {
    const named = (await walk(root)).filter((entry) => (entry.rel.split('/').pop() ?? '').includes(from.name));
    // Deepest first so a renamed parent never invalidates a child path.
    named.sort((a, b) => b.rel.split('/').length - a.rel.split('/').length);
    for (const entry of named) {
      const base = entry.rel.split('/').pop() ?? '';
      const target = `${entry.rel.slice(0, entry.rel.length - base.length)}${base.replaceAll(from.name, to.name)}`;
      await move(root, entry.rel, target);
      moved.push({ from: entry.rel, to: target });
    }
  }
  return moved;
}
