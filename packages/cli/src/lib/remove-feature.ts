import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FeatureManifest, FeatureName } from '@rn-tempo/contracts';

import { CliError } from './errors.ts';
import { assertInsideProject, globToRegExp, pathExists, pruneEmptyDirs, removePath, walk } from './fs-utils.ts';
import { stripFeaturesInProject } from './markers.ts';
import type { ManifestMap } from './manifest.ts';

export type PostRemoveStep = 'pods' | 'assets-sync';

export type RemoveResult = {
  features: FeatureName[];
  strippedFiles: string[];
  deletedPaths: string[];
  removedDependencies: string[];
  patchedFiles: string[];
  removedEnvKeys: string[];
  /** Steps the caller must run once, after everything else (`pods`, `assets-sync`). */
  postRemove: PostRemoveStep[];
};

type JsonObject = Record<string, unknown>;

/** Removes entries matching the manifests' `deleteGlobs`; returns the deleted project-relative paths. */
export async function deleteGlobs(root: string, globs: readonly string[]): Promise<string[]> {
  for (const glob of globs) assertInsideProject(glob, 'deleteGlobs entry');
  if (globs.length === 0) return [];
  const patterns = globs.map(globToRegExp);
  const entries = await walk(root);
  const matched = entries.filter((entry) => patterns.some((pattern) => pattern.test(entry.rel)));
  // Parents come first in `walk`, so a matched directory swallows everything below it.
  const roots: string[] = [];
  for (const entry of matched) {
    if (!roots.some((parent) => entry.rel === parent || entry.rel.startsWith(`${parent}/`))) roots.push(entry.rel);
  }
  for (const rel of roots) {
    await removePath(path.join(root, rel));
    await pruneEmptyDirs(root, path.dirname(path.join(root, rel)));
  }
  return roots;
}

async function readJson(file: string): Promise<JsonObject> {
  return JSON.parse(await readFile(file, 'utf8')) as JsonObject;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Removes dependencies from `package.json`, except those another kept manifest still lists. */
export async function removeDependencies(root: string, names: readonly string[]): Promise<string[]> {
  const file = path.join(root, 'package.json');
  if (names.length === 0 || !(await pathExists(file))) return [];
  const pkg = await readJson(file);
  const removed: string[] = [];
  for (const section of ['dependencies', 'devDependencies'] as const) {
    const block = pkg[section] as Record<string, string> | undefined;
    if (!block) continue;
    for (const name of names) {
      if (name in block) {
        Reflect.deleteProperty(block, name);
        if (!removed.includes(name)) removed.push(name);
      }
    }
  }
  if (removed.length > 0) await writeJson(file, pkg);
  return removed;
}

function unescapePointer(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/** Applies one RFC 6902 `remove` to a parsed JSON value; returns false when the path does not exist. */
export function applyJsonRemove(document: unknown, pointer: string): boolean {
  const segments = pointer.split('/').slice(1).map(unescapePointer);
  if (segments.length === 0) return false;
  let current: unknown = document;
  for (const segment of segments.slice(0, -1)) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[segment];
  }
  const last = segments.at(-1);
  if (last === undefined || current === null || typeof current !== 'object') return false;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
    current.splice(index, 1);
    return true;
  }
  const record = current as Record<string, unknown>;
  if (!(last in record)) return false;
  Reflect.deleteProperty(record, last);
  return true;
}

/** Applies the manifests' `jsonPatches`; paths that are already gone are skipped (idempotent). */
export async function applyJsonPatches(root: string, patches: readonly FeatureManifest['jsonPatches'][number][]): Promise<string[]> {
  const patched = new Set<string>();
  const byFile = new Map<string, string[]>();
  for (const patch of patches) {
    assertInsideProject(patch.file, 'jsonPatches file');
    byFile.set(patch.file, [...(byFile.get(patch.file) ?? []), patch.path]);
  }
  for (const [file, pointers] of byFile) {
    const absolute = path.join(root, file);
    if (!(await pathExists(absolute))) continue;
    const document = JSON.parse(await readFile(absolute, 'utf8')) as unknown;
    let changed = false;
    for (const pointer of pointers) changed = applyJsonRemove(document, pointer) || changed;
    if (changed) {
      await writeJson(absolute, document);
      patched.add(file);
    }
  }
  return [...patched];
}

/** Removes `KEY=` lines from the `.env*` files at the project root. */
export async function removeEnvKeys(root: string, keys: readonly string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const removed = new Set<string>();
  const files = (await readdir(root)).filter((name) => name === '.env' || name.startsWith('.env.'));
  for (const name of files) {
    const absolute = path.join(root, name);
    const lines = (await readFile(absolute, 'utf8')).split('\n');
    const kept = lines.filter((line) => {
      const key = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      if (key !== undefined && keys.includes(key)) {
        removed.add(key);
        return false;
      }
      return true;
    });
    if (kept.length !== lines.length) await writeFile(absolute, kept.join('\n'));
  }
  return [...removed];
}

/**
 * Applies the removal of `features`: delete globs, strip markers, drop dependencies, apply
 * `jsonPatches`, remove env keys. `postRemove` steps are returned, not run.
 * `manifests` must contain every feature of the project (removed and kept).
 */
export async function removeFeatures(
  root: string,
  manifests: ManifestMap,
  features: readonly FeatureName[],
  keep: readonly FeatureName[],
): Promise<RemoveResult> {
  const removing = features.map((name) => {
    const manifest = manifests.get(name);
    if (!manifest) throw new CliError(`Unknown feature "${name}"`, { code: 'UNKNOWN_FEATURE' });
    return manifest;
  });
  const keptManifests = keep.flatMap((name) => manifests.get(name) ?? []);
  const stillUsed = new Set(keptManifests.flatMap((manifest) => [...manifest.dependencies, ...manifest.devDependencies]));
  const stillUsedEnv = new Set(keptManifests.flatMap((manifest) => manifest.envKeys));

  const deletedPaths = await deleteGlobs(root, removing.flatMap((manifest) => manifest.deleteGlobs));
  const { changed } = await stripFeaturesInProject(root, features);
  const removedDependencies = await removeDependencies(
    root,
    removing.flatMap((manifest) => [...manifest.dependencies, ...manifest.devDependencies]).filter((name) => !stillUsed.has(name)),
  );
  const patchedFiles = await applyJsonPatches(root, removing.flatMap((manifest) => manifest.jsonPatches));
  const removedEnvKeys = await removeEnvKeys(
    root,
    removing.flatMap((manifest) => manifest.envKeys).filter((key) => !stillUsedEnv.has(key)),
  );
  const postRemove = [...new Set(removing.flatMap((manifest) => manifest.postRemove))];

  return { features: [...features], strippedFiles: changed, deletedPaths, removedDependencies, patchedFiles, removedEnvKeys, postRemove };
}
