import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { createBackend, DEFINITION_FILE, serializeDefinition, writeFileAtomic } from '../folder.ts';
import type { RawDefinition } from '../manager.ts';
import { DefinitionError, parseBackend } from '../schema.ts';

import { fetchApiFile } from './fetch-url.ts';
import { importApiText, MAX_IMPORT_BYTES, type ImportedApi } from './openapi.ts';
import { applyImport, diffImport, type ApplyResult, type ImportDiff } from './sync.ts';

export interface CliImportResult {
  created: boolean;
  imported: ImportedApi;
  diff: ImportDiff;
  /** Absent for a preview. */
  applied?: ApplyResult['applied'];
}

/** True for `https://...` and `http://...` (which the fetch then limits to localhost). */
const isUrl = (value: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

/**
 * `import <dir> --openapi <file|url>`: creates the backend when the folder has none, else updates it. Without choices it
 * adds new endpoints, takes changes to endpoints you never edited, keeps the ones you edited and deletes nothing.
 * `preview` only reports. A URL is fetched with the same limits as in the dashboard; the command runs on your own
 * machine, so private addresses are allowed.
 */
export async function importFromCli(dir: string, source: string, options: { preview?: boolean; name?: string; allowPrivate?: boolean; now?: () => Date } = {}): Promise<CliImportResult> {
  const root = resolve(dir);
  let text: string;
  let label: string;
  if (isUrl(source)) {
    const got = await fetchApiFile(source, { allowPrivate: options.allowPrivate ?? true });
    text = got.text;
    const url = new URL(got.url);
    label = `${url.origin}${url.pathname}`;
  } else {
    const file = resolve(source);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      throw new DefinitionError(`Cannot read ${source}.`);
    }
    if (size > MAX_IMPORT_BYTES) throw new DefinitionError('That file is larger than 10 MB.');
    text = readFileSync(file, 'utf8');
    label = basename(file);
  }
  const imported = importApiText(text, isUrl(source) ? new URL(source).pathname : source);
  const definitionPath = join(root, DEFINITION_FILE);
  const created = !existsSync(definitionPath);
  if (created && options.preview !== true) createBackend(root, { name: options.name ?? imported.title ?? basename(root), preset: 'empty' });
  const current: RawDefinition = created ? { name: options.name ?? imported.title ?? basename(root), endpoints: [] } : (JSON.parse(readFileSync(definitionPath, 'utf8')) as RawDefinition);
  const diff = diffImport(current, imported);
  if (options.preview === true) return { created, imported, diff };
  const result = applyImport(current, imported, label, {}, (options.now ?? ((): Date => new Date()))());
  parseBackend(result.definition, 'The imported definition');
  writeFileAtomic(definitionPath, serializeDefinition(result.definition));
  return { created, imported, diff, applied: result.applied };
}

/** A short report of an import for the terminal. */
export function formatImport(result: CliImportResult, preview: boolean): string {
  const { diff, imported } = result;
  const lines = [`${preview ? 'Would import' : 'Imported'} ${String(imported.endpoints.length)} endpoint(s) from a ${imported.format} file.`];
  const list = (title: string, entries: { method: string; path: string }[]): void => {
    if (entries.length > 0) lines.push(`  ${title} (${String(entries.length)}): ${entries.slice(0, 8).map((entry) => `${entry.method} ${entry.path}`).join(', ')}${entries.length > 8 ? ', ...' : ''}`);
  };
  list('added', diff.added);
  list('changed', diff.changed);
  list('removed from the file (kept)', diff.removed);
  if (diff.unchanged.length > 0) lines.push(`  unchanged (${String(diff.unchanged.length)})`);
  if (diff.changed.some((entry) => entry.customized === true)) lines.push('  Endpoints you edited keep your version (use the dashboard to take the new one or merge).');
  for (const warning of imported.warnings) lines.push(`  warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}
