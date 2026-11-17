import { randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { presetBundle } from './presets.ts';
import { DefinitionError, parseBackend, type Backend, type BackendInput } from './schema.ts';

export const DEFINITION_FILE = 'backend.json';
export const DATA_DIR = '.data';

export interface BackendFolder {
  /** Absolute path of the backend folder. */
  dir: string;
  definitionPath: string;
  /** `<dir>/.data`: database, certificates, logs. Never a symlink. */
  dataDir: string;
  definition: Backend;
  /** The text the definition was read from, so a file watcher can tell its own writes from edits. */
  text: string;
}

/** Throws unless `path` is a real directory (or absent, when `create` is set, in which case it is made). */
export function ensureRealDir(path: string, label: string, create: boolean): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    if (!create) throw new DefinitionError(`${label} does not exist: ${path}`);
    mkdirSync(path, { recursive: false, mode: 0o700 });
    return;
  }
  if (stat.isSymbolicLink()) throw new DefinitionError(`${label} is a symbolic link and is not used: ${path}`);
  if (!stat.isDirectory()) throw new DefinitionError(`${label} is not a folder: ${path}`);
}

/**
 * Makes `.data` (and the subfolders the engine writes to) when missing, with its own `.gitignore`. A `.data`
 * or subfolder that is a symlink is refused, so a crafted backend folder cannot point the engine's writes
 * somewhere else.
 */
export function prepareDataDir(dir: string): string {
  const dataDir = join(dir, DATA_DIR);
  ensureRealDir(dataDir, '.data', true);
  // `wx` never follows a link, not even a dangling one; an existing path is left alone unless it is a link.
  const ignore = join(dataDir, '.gitignore');
  try {
    writeFileSync(ignore, '*\n', { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (lstatSync(ignore).isSymbolicLink()) throw new DefinitionError(`.data/.gitignore is a symbolic link and is not used: ${ignore}`);
  }
  for (const sub of ['logs', 'certs']) ensureRealDir(join(dataDir, sub), `.data/${sub}`, true);
  return dataDir;
}

export function readDefinitionText(definitionPath: string): { definition: Backend; text: string } {
  let text: string;
  try {
    text = readFileSync(definitionPath, 'utf8');
  } catch {
    throw new DefinitionError(`${DEFINITION_FILE} not found in ${resolve(definitionPath, '..')}. Create a backend first.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new DefinitionError(`${DEFINITION_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { definition: parseBackend(json), text };
}

/** Validates `backend.json` and prepares `.data`. */
export function openBackend(dir: string): BackendFolder {
  const root = resolve(dir);
  ensureRealDir(root, 'The backend folder', false);
  const definitionPath = join(root, DEFINITION_FILE);
  const { definition, text } = readDefinitionText(definitionPath);
  return { dir: root, definitionPath, dataDir: prepareDataDir(root), definition, text };
}

export const PRESETS = ['empty', 'products', 'tempo-template'] as const;
export type Preset = (typeof PRESETS)[number];

/** The text of a definition, as written to disk. */
export function serializeDefinition(definition: BackendInput | Backend): string {
  return `${JSON.stringify(definition, null, 2)}\n`;
}

/** Writes a file next to its target and renames it over, so a watcher never reads half of it. */
export function writeFileAtomic(path: string, text: string): void {
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' }); // `wx`: never follows a planted link
  renameSync(temp, path);
}

/** A starting definition. The `products` preset is a small dummyjson-style collection with its endpoints. */
export function presetDefinition(name: string, preset: Preset): BackendInput {
  const bundle = presetBundle(preset, name);
  if (bundle !== undefined) return bundle.definition;
  const base: BackendInput = { name, port: 8443, https: true, collections: [], endpoints: [] };
  if (preset === 'empty') return base;
  return {
    ...base,
    collections: [
      {
        name: 'products',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'description', type: 'string' },
          { name: 'price', type: 'number', required: true },
          { name: 'category', type: 'string' },
          { name: 'stock', type: 'number', default: 0 },
        ],
        seed: [
          { title: 'Essence Mascara', description: 'A popular mascara.', price: 9.99, category: 'beauty', stock: 99 },
          { title: 'Desk Lamp', description: 'A small desk lamp.', price: 24.5, category: 'home', stock: 12 },
        ],
      },
    ],
    endpoints: crudEndpoints('products', { basePath: '/products', addAlias: true }),
  };
}

/** The usual five endpoints of a collection: list, search, get, create (plus `/add`), update and delete. */
export function crudEndpoints(collection: string, options: { basePath: string; addAlias?: boolean }): NonNullable<BackendInput['endpoints']> {
  const base = options.basePath;
  const id = (suffix: string): string => `${collection}.${suffix}`;
  return [
    { id: id('list'), type: 'crud', collection, action: 'list', method: 'GET', path: base, tags: [collection] },
    { id: id('search'), type: 'crud', collection, action: 'list', method: 'GET', path: `${base}/search`, tags: [collection] },
    { id: id('get'), type: 'crud', collection, action: 'get', method: 'GET', path: `${base}/:id`, tags: [collection] },
    {
      id: id('create'),
      type: 'crud',
      collection,
      action: 'create',
      method: 'POST',
      path: base,
      ...(options.addAlias === true ? { aliases: [`${base}/add`] } : {}),
      tags: [collection],
    },
    { id: id('update'), type: 'crud', collection, action: 'update', method: 'PUT', path: `${base}/:id`, tags: [collection] },
    { id: id('patch'), type: 'crud', collection, action: 'update', method: 'PATCH', path: `${base}/:id`, tags: [collection] },
    { id: id('delete'), type: 'crud', collection, action: 'delete', method: 'DELETE', path: `${base}/:id`, tags: [collection] },
  ];
}

/** Writes a minimal `backend.json` (and `.data`). Refuses to overwrite an existing backend. */
export function createBackend(dir: string, options: { name: string; preset?: Preset }): BackendFolder {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });
  ensureRealDir(root, 'The backend folder', false);
  const definitionPath = join(root, DEFINITION_FILE);
  if (existsSync(definitionPath)) throw new DefinitionError(`${DEFINITION_FILE} already exists in ${root}.`);
  const input = presetDefinition(options.name, options.preset ?? 'empty');
  parseBackend(input, 'The new definition');
  // Preset files (seed data, handlers) have fixed names; they never overwrite anything (`wx`).
  for (const file of presetBundle(options.preset ?? 'empty', options.name)?.files ?? []) {
    const target = join(root, file.path);
    ensureRealDir(resolve(target, '..'), file.path.split('/')[0] ?? '', true);
    writeFileSync(target, file.text, { flag: 'wx', mode: 0o600 });
  }
  writeFileSync(definitionPath, serializeDefinition(input), { flag: 'wx' });
  return openBackend(root);
}

/**
 * Reads a seed file by name. The name is a path inside `seed/`; it must resolve (symlinks included) to a file
 * that is still inside `seed/`.
 */
export function readSeedFile(dir: string, name: string): Record<string, unknown>[] {
  const seedDir = join(dir, 'seed');
  const target = resolve(seedDir, name);
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new DefinitionError(`Seed file not found: seed/${name}`);
  }
  const realSeed = realpathSync(seedDir);
  if (!real.startsWith(realSeed + sep)) throw new DefinitionError(`Seed file "${name}" is outside the seed folder.`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(real, 'utf8'));
  } catch (error) {
    throw new DefinitionError(`seed/${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(json) || !json.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
    throw new DefinitionError(`seed/${name} must be a JSON array of objects.`);
  }
  return json as Record<string, unknown>[];
}

/** Opens a file for appending without following a symlink (`O_NOFOLLOW`). The caller closes the descriptor. */
export function openAppendNoFollow(path: string): number {
  return openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
}

/** Creates an empty file if missing, never following a link. */
export function touchNoFollow(path: string): void {
  closeSync(openAppendNoFollow(path));
}
