import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { commentStylesFor, scanMarkers, stripFeature, type FeatureManifest, type FeatureName } from '@rn-tempo/contracts';

import { aiToolsFor, identityOf } from './create.ts';
import { CliError } from './errors.ts';
import { fetchTemplate } from './fetch-template.ts';
import { assertInsideProject, globToRegExp, isTextFile, pathExists, walk, walkFiles } from './fs-utils.ts';
import { loadManifests, resolveSelection, type ManifestMap } from './manifest.ts';
import { stripFeaturesInProject } from './markers.ts';
import { renameProject } from './rename.ts';
import { readTempoJson, writeTempoJson } from './tempo-json.ts';

export type AddConflict = {
  file: string;
  reason: string;
  /** The region (or line) the CLI could not place; shown so it can be merged by hand. */
  region?: string;
};

export type AddFeatureOptions = {
  projectDir: string;
  /** Used to resolve a relative `template` path. */
  cwd: string;
  feature: FeatureName;
  /** `--template`: local folder or giget source; defaults to the tag of the project's `templateVersion`. */
  template?: string;
  /** Overwrite files that already exist in the project. */
  force?: boolean;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
};

export type AddFeatureResult = {
  ok: true;
  feature: FeatureName;
  /** Every feature that was enabled: the requested one plus unmet `requires`. */
  features: FeatureName[];
  /** New files created in the project. */
  added: string[];
  /** Existing files that were (or, on a dry run, would be) changed. */
  updated: string[];
  conflicts: AddConflict[];
  followUps: string[];
  dryRun: boolean;
};

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Region re-insertion
// ---------------------------------------------------------------------------------------------

/** A marked region; `at` is the index in the template-without-the-feature where it belongs. */
type Region = { at: number; lines: string[] };

/** Splits a template text into the marked regions of `feature` and the lines without them. */
function extractRegions(text: string, feature: FeatureName, filePath: string): { regions: Region[]; rest: string[] } {
  const stripped = stripFeature(text, feature, filePath).split('\n');
  const regions: Region[] = [];
  const rest: string[] = [];
  let current: Region | null = null;
  for (const line of text.split('\n')) {
    const marker = scanMarkers(line)[0];
    const mine = marker !== undefined && marker.name === feature;
    if (current === null && mine) {
      current = { at: rest.length, lines: [line] };
      if (marker.kind === 'single') {
        regions.push(current);
        current = null;
      }
    } else if (current !== null) {
      current.lines.push(line);
      if (mine && marker.kind === 'end') {
        regions.push(current);
        current = null;
      }
    } else {
      rest.push(line);
    }
  }
  if (rest.length !== stripped.length) throw new Error(`Internal error: could not split the regions of ${filePath}`);
  return { regions, rest };
}

const same = (a: string | undefined, b: string | undefined) => (a ?? '').trimEnd() === (b ?? '').trimEnd();

/** Positions in `project` where `before` directly precedes and `after` (when given) directly follows. */
function findAnchors(project: readonly string[], before: readonly string[], after: readonly string[] | null): number[] {
  const hits: number[] = [];
  const tail = after?.length ?? 0;
  for (let p = before.length; p <= project.length - tail; p += 1) {
    if (before.length === 0 && p !== 0) break; // nothing precedes the region: it starts the file
    if (!before.every((line, i) => same(project[p - before.length + i], line))) continue;
    if (after !== null) {
      if (after.length === 0 && p !== project.length) continue; // nothing follows: it ends the file
      if (!after.every((line, i) => same(project[p + i], line))) continue;
    }
    hits.push(p);
  }
  return hits;
}

/**
 * Finds the line index in `project` where a region goes, using 1 to 3 lines of template context on
 * each side; returns a reason string when the position is not unambiguous. Never guesses.
 */
function locate(rest: readonly string[], project: readonly string[], at: number): number | string {
  let ambiguous = false;
  for (const size of [1, 2, 3]) {
    const hits = findAnchors(project, rest.slice(Math.max(0, at - size), at), rest.slice(at, at + size));
    if (hits.length === 1 && hits[0] !== undefined) return hits[0];
    if (hits.length > 1) ambiguous = true;
  }
  if (ambiguous) return 'the surrounding lines occur more than once, so the position is ambiguous';
  // The lines after the region changed in the project: anchor on the preceding lines alone.
  for (const size of [1, 2, 3]) {
    const before = rest.slice(Math.max(0, at - size), at);
    if (before.every((line) => line.trim() === '')) continue;
    const hits = findAnchors(project, before, null);
    if (hits.length === 1 && hits[0] !== undefined) return hits[0];
    if (hits.length > 1) return 'the preceding lines occur more than once, so the position is ambiguous';
  }
  return 'the surrounding lines were not found (the file changed since it was generated)';
}

export type InsertResult = { text: string; inserted: number; conflicts: { reason: string; region: string }[] };

/**
 * Re-inserts the marker regions (and single-line markers) of `feature` found in `templateText` into
 * `projectText`. A region goes where its neighbours in the template match; if that is not
 * unambiguous it is reported as a conflict and left out.
 */
export function insertRegions(templateText: string, projectText: string, feature: FeatureName, filePath: string): InsertResult {
  const { regions, rest } = extractRegions(templateText, feature, filePath);
  const project = projectText.split('\n');
  const conflicts: InsertResult['conflicts'] = [];
  const inserts: { at: number; order: number; lines: string[] }[] = [];
  regions.forEach((region, order) => {
    if (project.some((line) => same(line, region.lines[0]))) return; // already there
    const at = locate(rest, project, region.at);
    if (typeof at === 'string') conflicts.push({ reason: at, region: region.lines.join('\n') });
    else inserts.push({ at, order, lines: region.lines });
  });
  // Apply from the bottom so earlier indexes stay valid; same-position regions keep template order.
  inserts.sort((a, b) => b.at - a.at || b.order - a.order);
  for (const insert of inserts) project.splice(insert.at, 0, ...insert.lines);
  return { text: project.join('\n'), inserted: inserts.length, conflicts };
}

// ---------------------------------------------------------------------------------------------
// package.json, JSON patches and env files
// ---------------------------------------------------------------------------------------------

/** Adds `key` to `target` right after the nearest key that precedes it in `order` (else first). */
function insertOrdered(target: Json, key: string, value: unknown, order: readonly string[]): void {
  const entries = Object.entries(target);
  let index = 0;
  for (let i = order.indexOf(key) - 1; i >= 0; i -= 1) {
    const found = entries.findIndex(([name]) => name === order[i]);
    if (found >= 0) {
      index = found + 1;
      break;
    }
  }
  entries.splice(index, 0, [key, value]);
  for (const name of Object.keys(target)) Reflect.deleteProperty(target, name);
  for (const [name, entry] of entries) target[name] = entry;
}

function unescapePointer(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

// Pointers come from manifests in a fetched template; never let them reach the prototype chain.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function readPointer(document: unknown, segments: readonly string[]): unknown {
  let current = document;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Re-adds the value at an RFC 6901 `pointer` from `source` into `target`. Returns `added`,
 * `present` (nothing to do) or a reason string when it cannot be restored.
 */
export function restoreJsonPointer(target: unknown, source: unknown, pointer: string): string {
  const segments = pointer.split('/').slice(1).map(unescapePointer);
  const last = segments.at(-1);
  if (last === undefined) return 'empty JSON pointer';
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return `${pointer} is not an allowed JSON pointer`;
  const value = readPointer(source, segments);
  if (value === undefined) return `${pointer} does not exist in the template`;
  const parent = readPointer(target, segments.slice(0, -1));
  if (parent === null || typeof parent !== 'object') return `the parent of ${pointer} does not exist in the project`;
  if (Array.isArray(parent)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0) return `${pointer} is not a valid array index`;
    parent.splice(Math.min(index, parent.length), 0, value);
    return 'added';
  }
  const record = parent as Json;
  if (Object.hasOwn(record, last)) return 'present';
  insertOrdered(record, last, value, Object.keys((readPointer(source, segments.slice(0, -1)) ?? {}) as Json));
  return 'added';
}

const ENV_KEY = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const keyOf = (line: string) => ENV_KEY.exec(line)?.[1];

function envKeys(text: string): string[] {
  return text.split('\n').flatMap((line) => keyOf(line) ?? []);
}

/** Adds `KEY=value` lines (from `referenceText`) for keys missing in `projectText`, in reference order. */
export function restoreEnvKeys(projectText: string, referenceText: string, keys: readonly string[]): { text: string; added: string[] } {
  const lines = projectText.split('\n');
  const reference = referenceText.split('\n');
  const order = envKeys(referenceText);
  const added: string[] = [];
  for (const key of keys) {
    if (lines.some((line) => keyOf(line) === key)) continue;
    const line = reference.find((candidate) => keyOf(candidate) === key);
    if (line === undefined) continue;
    let index = -1;
    for (let i = order.indexOf(key) - 1; i >= 0 && index < 0; i -= 1) {
      index = lines.findIndex((candidate) => keyOf(candidate) === order[i]);
    }
    if (index >= 0) lines.splice(index + 1, 0, line);
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, line);
    added.push(key);
  }
  return { text: lines.join('\n'), added };
}

// ---------------------------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------------------------

/** The closest ancestor of `dir` (itself included) that exists on disk. */
async function deepestExisting(dir: string): Promise<string> {
  let current = dir;
  while (!(await pathExists(current))) {
    const up = path.dirname(current);
    if (up === current) return current;
    current = up;
  }
  return current;
}

/** Pending file changes: reads see earlier writes, nothing touches the disk until `commit`. */
class Workspace {
  private readonly pending = new Map<string, string | Buffer>();
  readonly created = new Set<string>();
  readonly changed = new Set<string>();

  constructor(private readonly root: string) {}

  async exists(rel: string): Promise<boolean> {
    return this.pending.has(rel) || (await pathExists(path.join(this.root, rel)));
  }

  async read(rel: string): Promise<string> {
    const pending = this.pending.get(rel);
    if (pending !== undefined) return pending.toString();
    return readFile(path.join(this.root, rel), 'utf8');
  }

  async write(rel: string, content: string | Buffer): Promise<void> {
    assertInsideProject(rel, 'file to write');
    if (!(await this.exists(rel))) this.created.add(rel);
    else if (!this.created.has(rel)) this.changed.add(rel);
    this.pending.set(rel, content);
  }

  async commit(): Promise<void> {
    const root = await realpath(this.root);
    for (const [rel, content] of this.pending) {
      const target = path.join(this.root, rel);
      // A symlinked directory inside the project must not redirect writes (or mkdir) outside it.
      const parent = await realpath(await deepestExisting(path.dirname(target)));
      if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
        throw new CliError(`refusing to write ${rel}: its directory resolves outside the project`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      const existing = await lstat(target).catch(() => undefined);
      if (existing?.isSymbolicLink()) throw new CliError(`refusing to write ${rel}: it is a symlink`);
      await writeFile(target, content);
    }
  }
}

/** Files of the prepared template that `deleteGlobs` own (a matched directory expands to its files). */
async function ownedFiles(templateDir: string, globs: readonly string[]): Promise<string[]> {
  for (const glob of globs) assertInsideProject(glob, 'deleteGlobs entry');
  const patterns = globs.map(globToRegExp);
  const entries = await walk(templateDir);
  const matches = (rel: string) => patterns.some((pattern) => pattern.test(rel));
  const dirs = entries.filter((entry) => entry.isDir && matches(entry.rel)).map((entry) => entry.rel);
  return entries
    .filter((entry) => !entry.isDir && (matches(entry.rel) || dirs.some((dir) => entry.rel.startsWith(`${dir}/`))))
    .map((entry) => entry.rel);
}

/** Fetches the template, renames it like the project and drops regions of features the project lacks. */
async function prepareTemplate(options: AddFeatureOptions, templateVersion: string, dest: string, enabled: readonly FeatureName[]): Promise<ManifestMap> {
  await fetchTemplate({ template: options.template, cliVersion: templateVersion, dest, cwd: options.cwd });
  const original = await readTempoJson(dest);
  const project = await readTempoJson(options.projectDir);
  await renameProject(dest, identityOf(original), identityOf(project));
  const manifests = await loadManifests(dest);
  await stripFeaturesInProject(dest, [...manifests.keys()].filter((name) => !enabled.includes(name)));
  return manifests;
}

async function restoreDependencies(workspace: Workspace, templateDir: string, manifests: readonly FeatureManifest[], conflicts: AddConflict[]): Promise<void> {
  const wanted = manifests.flatMap((manifest) => [
    ...manifest.dependencies.map((name) => ({ name, section: 'dependencies' as const })),
    ...manifest.devDependencies.map((name) => ({ name, section: 'devDependencies' as const })),
  ]);
  if (wanted.length === 0) return;
  const project = JSON.parse(await workspace.read('package.json')) as Record<string, Json | undefined>;
  const template = JSON.parse(await readFile(path.join(templateDir, 'package.json'), 'utf8')) as Record<string, Json | undefined>;
  let changed = false;
  for (const { name, section } of wanted) {
    if (project.dependencies?.[name] !== undefined || project.devDependencies?.[name] !== undefined) continue;
    const version = template[section]?.[name] ?? template.dependencies?.[name] ?? template.devDependencies?.[name];
    if (typeof version !== 'string') {
      conflicts.push({ file: 'package.json', reason: `${name} is not in the template's package.json; add it manually` });
      continue;
    }
    const target = project[section] ?? {};
    insertOrdered(target, name, version, Object.keys(template[section] ?? {}));
    project[section] = target;
    changed = true;
  }
  if (changed) await workspace.write('package.json', `${JSON.stringify(project, null, 2)}\n`);
}

async function restoreJsonPatches(workspace: Workspace, templateDir: string, manifests: readonly FeatureManifest[], conflicts: AddConflict[]): Promise<void> {
  const byFile = new Map<string, string[]>();
  for (const patch of manifests.flatMap((manifest) => manifest.jsonPatches)) {
    assertInsideProject(patch.file, 'jsonPatches file');
    byFile.set(patch.file, [...(byFile.get(patch.file) ?? []), patch.path]);
  }
  for (const [file, pointers] of byFile) {
    if (!(await workspace.exists(file)) || !(await pathExists(path.join(templateDir, file)))) {
      conflicts.push({ file, reason: 'file to patch is missing in the project or the template' });
      continue;
    }
    const target = JSON.parse(await workspace.read(file)) as unknown;
    const source = JSON.parse(await readFile(path.join(templateDir, file), 'utf8')) as unknown;
    let changed = false;
    for (const pointer of pointers) {
      const outcome = restoreJsonPointer(target, source, pointer);
      if (outcome === 'added') changed = true;
      else if (outcome !== 'present') conflicts.push({ file, reason: outcome });
    }
    if (changed) await workspace.write(file, `${JSON.stringify(target, null, 2)}\n`);
  }
}

async function restoreEnv(workspace: Workspace, projectDir: string, templateDir: string, keys: readonly string[], conflicts: AddConflict[]): Promise<void> {
  if (keys.length === 0) return;
  const isEnv = (rel: string) => !rel.includes('/') && (rel === '.env' || rel.startsWith('.env.'));
  const projectFiles = (await walkFiles(projectDir)).filter(isEnv);
  const templateFiles = (await walkFiles(templateDir)).filter(isEnv);
  for (const file of projectFiles) {
    const text = await workspace.read(file);
    let next = text;
    for (const key of keys.filter((candidate) => !envKeys(text).includes(candidate))) {
      // The same file in the template first, then the shared examples.
      let reference: string | null = null;
      for (const candidate of [file, '.env.example', '.env.dev', ...templateFiles]) {
        if (!templateFiles.includes(candidate)) continue;
        const content = await readFile(path.join(templateDir, candidate), 'utf8');
        if (envKeys(content).includes(key)) {
          reference = content;
          break;
        }
      }
      if (reference === null) conflicts.push({ file, reason: `no value for ${key} in the template's env files; add it manually` });
      else next = restoreEnvKeys(next, reference, [key]).text;
    }
    if (next !== text) await workspace.write(file, next);
  }
}

/** Features to enable (the wanted one plus unmet `requires`), required ones first. */
function enableOrder(manifests: ManifestMap, wanted: FeatureName, enabled: readonly FeatureName[]): FeatureName[] {
  const { features } = resolveSelection(manifests, [...enabled, wanted]);
  const missing = features.filter((name) => !enabled.includes(name));
  const ordered: FeatureName[] = [];
  const visit = (name: FeatureName) => {
    if (ordered.includes(name) || !missing.includes(name)) return;
    for (const required of manifests.get(name)?.requires ?? []) visit(required);
    ordered.push(name);
  };
  for (const name of missing) visit(name);
  return ordered;
}

/**
 * Adds an optional module back to a generated project. The template of the project's
 * `templateVersion` is fetched and renamed like the project, then the module's files, marker
 * regions, dependencies, env keys and JSON entries are restored. Anything that cannot be placed
 * unambiguously is returned as a conflict instead of being guessed.
 */
export async function addFeature(options: AddFeatureOptions): Promise<AddFeatureResult> {
  const { projectDir, feature } = options;
  const tempo = await readTempoJson(projectDir);
  const projectManifests = await loadManifests(projectDir);
  if (!projectManifests.has(feature)) {
    throw new CliError(`Unknown feature "${feature}". Known: ${[...projectManifests.keys()].join(', ')}`, { code: 'UNKNOWN_FEATURE' });
  }
  if (tempo.features.includes(feature)) {
    throw new CliError(`Feature "${feature}" is already enabled in this project`, { code: 'FEATURE_ENABLED' });
  }
  const toAdd = enableOrder(projectManifests, feature, tempo.features);
  const nextFeatures = [...projectManifests.keys()].filter((name) => tempo.features.includes(name) || toAdd.includes(name));

  const tmp = await mkdtemp(path.join(tmpdir(), 'tempo-add-'));
  try {
    const templateDir = path.join(tmp, 'template');
    const manifests = await prepareTemplate(options, tempo.templateVersion, templateDir, nextFeatures);
    const selected = toAdd.flatMap((name) => manifests.get(name) ?? []);
    const workspace = new Workspace(projectDir);
    const conflicts: AddConflict[] = [];

    // 1. files the module owns (deleteGlobs)
    const owned = new Set(await ownedFiles(templateDir, selected.flatMap((manifest) => manifest.deleteGlobs)));
    for (const rel of [...owned].sort()) {
      if (!options.force && (await pathExists(path.join(projectDir, rel)))) {
        conflicts.push({ file: rel, reason: 'file already exists (use --force to overwrite)' });
        continue;
      }
      await workspace.write(rel, await readFile(path.join(templateDir, rel)));
    }

    // 2. marker regions in shared files, one module at a time (later modules are not in the text yet)
    const candidates = (await walkFiles(templateDir)).filter((file) => commentStylesFor(file).length > 0 && !owned.has(file));
    for (const [index, name] of toAdd.entries()) {
      const later = toAdd.slice(index + 1);
      for (const rel of candidates) {
        const absolute = path.join(templateDir, rel);
        if (!(await isTextFile(absolute))) continue;
        let text = await readFile(absolute, 'utf8');
        if (!scanMarkers(text).some((marker) => marker.name === name)) continue;
        for (const other of later) text = stripFeature(text, other, rel);
        if (!(await workspace.exists(rel))) {
          conflicts.push({ file: rel, reason: `file is missing in the project, so ${name} could not be re-inserted` });
          continue;
        }
        const result = insertRegions(text, await workspace.read(rel), name, rel);
        for (const conflict of result.conflicts) conflicts.push({ file: rel, ...conflict });
        if (result.inserted > 0) await workspace.write(rel, result.text);
      }
    }

    // 3. package.json, JSON patches, env keys
    await restoreDependencies(workspace, templateDir, selected, conflicts);
    await restoreJsonPatches(workspace, templateDir, selected, conflicts);
    await restoreEnv(workspace, projectDir, templateDir, selected.flatMap((manifest) => manifest.envKeys), conflicts);

    // 4. .tempo.json
    const dryRun = options.dryRun === true;
    if (!dryRun) {
      await workspace.commit();
      await writeTempoJson(projectDir, { ...tempo, features: nextFeatures, ai: { ...tempo.ai, tools: aiToolsFor(nextFeatures) } });
    }

    const followUps: string[] = [];
    const post = new Set(selected.flatMap((manifest) => manifest.postRemove));
    if (selected.some((manifest) => manifest.dependencies.length + manifest.devDependencies.length > 0)) followUps.push('Run yarn install to update the lockfile');
    if (post.has('pods')) followUps.push('Run pod install in ios/');
    if (post.has('assets-sync')) followUps.push('Run yarn assets:sync');
    if (conflicts.length > 0) followUps.push('Merge the conflicts by hand (regions are printed), then run tempo doctor');

    return {
      ok: true,
      feature,
      features: toAdd,
      added: [...workspace.created].sort(),
      updated: [...new Set([...workspace.changed, '.tempo.json'])].sort(),
      conflicts,
      followUps,
      dryRun,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
