import { DefinitionError } from '../schema.ts';
import type { RawDefinition } from '../manager.ts';

import { fingerprint, stableJson, type ImportedApi, type ImportedEndpoint, type ImportFormat } from './openapi.ts';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

export const CHANGE_CHOICES = ['take-new', 'keep-mine', 'merge'] as const;
export type ChangeChoice = (typeof CHANGE_CHOICES)[number];
const MAX_IMPORT_RECORDS = 20;

export interface DiffEntry {
  id: string;
  method: string;
  path: string;
  tags: string[];
  summary?: string;
  /** Edited after the import that made it (or never imported): its fingerprint no longer matches. */
  customized?: boolean;
  /** For a change: what differs (`request.body`, `response 404`, `scenario added: 422`...). */
  changes?: string[];
}

export interface ImportDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
  /** New operations that were left out because another endpoint already answers that route. */
  skipped: { id: string; method: string; path: string; reason: string }[];
}

export interface ImportChoices {
  /** Per endpoint id: add it? Default yes. */
  add?: Record<string, boolean>;
  /** Per endpoint id: delete it? Default no. */
  remove?: Record<string, boolean>;
  /** Per endpoint id: how to take the change. Default `take-new` for an untouched endpoint and `keep-mine` for a customized one. */
  change?: Record<string, ChangeChoice>;
}

const asRecord = (value: unknown): Json => (isObject(value) ? value : {});
const endpointsOf = (definition: RawDefinition): Json[] => (definition.endpoints ?? []).map((endpoint) => endpoint as unknown as Json);

const entryOf = (endpoint: Json, extra: Partial<DiffEntry> = {}): DiffEntry => ({
  id: String(endpoint.id),
  method: String(endpoint.method),
  path: String(endpoint.path),
  tags: Array.isArray(endpoint.tags) ? endpoint.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  ...(typeof endpoint.summary === 'string' ? { summary: endpoint.summary } : {}),
  ...extra,
});

const routeKey = (method: unknown, path: string): string => `${String(method)} ${path.replace(/:[A-Za-z0-9_]+/g, ':')}`;
const routesOf = (endpoint: Json): string[] => [String(endpoint.path), ...(Array.isArray(endpoint.aliases) ? endpoint.aliases.map(String) : [])].map((path) => routeKey(endpoint.method, path));

/** What differs between the endpoint as it is and the one the new file describes. Bodies count only for an untouched endpoint. */
function shapeChanges(mine: Json, next: Json, customized: boolean): string[] {
  const out: string[] = [];
  for (const key of ['method', 'path', 'summary', 'auth'] as const) if (!same(mine[key] ?? (key === 'auth' ? 'none' : undefined), next[key] ?? (key === 'auth' ? 'none' : undefined))) out.push(key);
  if (!same(mine.tags ?? [], next.tags ?? [])) out.push('tags');
  const mineRequest = asRecord(mine.request);
  const nextRequest = asRecord(next.request);
  for (const part of ['params', 'query', 'body', 'bodyRequired'] as const) if (!same(mineRequest[part], nextRequest[part])) out.push(`request.${part}`);
  const mineScenarios = asRecord(mine.scenarios);
  const nextScenarios = asRecord(next.scenarios);
  for (const name of Object.keys(nextScenarios)) {
    const before = mineScenarios[name];
    if (before === undefined) {
      out.push(`scenario added: ${name}`);
      continue;
    }
    const a = asRecord(before);
    const b = asRecord(nextScenarios[name]);
    if (!same(a.schema, b.schema)) out.push(`response schema: ${name}`);
    if (a.status !== b.status) out.push(`response status: ${name}`);
    if (!customized && !same(a.body, b.body)) out.push(`response example: ${name}`);
  }
  for (const name of Object.keys(mineScenarios)) if (nextScenarios[name] === undefined) out.push(`scenario not in the file any more: ${name}`);
  if (mine.status !== next.status) out.push('default status');
  if (!customized && !same(mine.body, next.body)) out.push('default example');
  return out;
}

/**
 * Compares an import with the endpoints a backend has. Matching is by endpoint id. `importedFrom` is the fingerprint of the
 * endpoint as the last import made it, so: the same fingerprint in the file means nothing changed in the file; a
 * current endpoint whose own fingerprint differs from `importedFrom` was edited afterwards (`customized`).
 * Endpoints that no import made (no `importedFrom`) are never listed as removed.
 */
export function diffImport(definition: RawDefinition, imported: ImportedApi): ImportDiff {
  const current = endpointsOf(definition);
  const byId = new Map(current.map((endpoint) => [String(endpoint.id), endpoint]));
  const importedIds = new Set(imported.endpoints.map((endpoint) => endpoint.id));
  const taken = new Map<string, string>();
  for (const endpoint of current) for (const key of routesOf(endpoint)) taken.set(key, String(endpoint.id));
  const diff: ImportDiff = { added: [], removed: [], changed: [], unchanged: [], skipped: [] };

  for (const next of imported.endpoints) {
    const mine = byId.get(next.id);
    if (mine === undefined) {
      const clash = routesOf(next).map((key) => taken.get(key)).find((id) => id !== undefined);
      if (clash === undefined) diff.added.push(entryOf(next));
      else diff.skipped.push({ id: next.id, method: next.method, path: next.path, reason: `Another endpoint (${clash}) already answers this route.` });
      continue;
    }
    const baseline = typeof mine.importedFrom === 'string' ? mine.importedFrom : undefined;
    const customized = baseline === undefined || fingerprint(mine) !== baseline;
    if (baseline === next.importedFrom) diff.unchanged.push(entryOf(mine, { customized }));
    else diff.changed.push(entryOf(next, { customized, changes: shapeChanges(mine, next, customized) }));
  }
  for (const mine of current) {
    if (typeof mine.importedFrom === 'string' && !importedIds.has(String(mine.id))) diff.removed.push(entryOf(mine, { customized: fingerprint(mine) !== mine.importedFrom }));
  }
  return diff;
}

/** Keeps your bodies, statuses, headers and delays; takes the file's schemas, descriptions, request rules and new scenarios. */
function mergeEndpoint(mine: Json, next: ImportedEndpoint): Json {
  const mineScenarios = asRecord(mine.scenarios);
  const nextScenarios = asRecord(next.scenarios);
  const scenarios: Json = {};
  for (const [name, before] of Object.entries(mineScenarios)) {
    const incoming = asRecord(nextScenarios[name]);
    const kept: Json = { ...asRecord(before) };
    for (const key of ['schema', 'description'] as const) {
      if (incoming[key] === undefined) delete kept[key];
      else kept[key] = incoming[key];
    }
    scenarios[name] = kept;
  }
  for (const [name, scenario] of Object.entries(nextScenarios)) if (scenarios[name] === undefined) scenarios[name] = scenario;
  const merged: Json = { ...mine, method: next.method, path: next.path, scenarios, importedFrom: next.importedFrom };
  for (const key of ['summary', 'tags', 'request'] as const) {
    if (next[key] === undefined) delete merged[key];
    else merged[key] = next[key];
  }
  if (next.auth === undefined) delete merged.auth;
  else merged.auth = next.auth;
  if (Object.keys(scenarios).length === 0) delete merged.scenarios;
  return merged;
}

export interface ApplyResult {
  definition: RawDefinition;
  applied: { added: string[]; removed: string[]; taken: string[]; kept: string[]; merged: string[] };
  /** A note about the base path, when the file's differs from the backend's. */
  notes: string[];
}

/** The definition after the user's choices. Nothing is written here; the caller commits it. */
export function applyImport(definition: RawDefinition, imported: ImportedApi, source: string, choices: ImportChoices, now: Date): ApplyResult {
  for (const [id, choice] of Object.entries(choices.change ?? {})) {
    if (!(CHANGE_CHOICES as readonly string[]).includes(choice)) throw new DefinitionError(`"${String(choice)}" is not a choice for ${id}. Use take-new, keep-mine or merge.`);
  }
  const diff = diffImport(definition, imported);
  const next = structuredClone(definition);
  const nextById = new Map(imported.endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const applied: ApplyResult['applied'] = { added: [], removed: [], taken: [], kept: [], merged: [] };
  const removeIds = new Set(diff.removed.filter((entry) => choices.remove?.[entry.id] === true).map((entry) => entry.id));
  const changes = new Map(diff.changed.map((entry) => [entry.id, entry]));

  const endpoints: unknown[] = [];
  for (const raw of next.endpoints ?? []) {
    const mine = raw as unknown as Json;
    const id = String(mine.id);
    if (removeIds.has(id)) {
      applied.removed.push(id);
      continue;
    }
    const entry = changes.get(id);
    const incoming = nextById.get(id);
    if (entry === undefined || incoming === undefined) {
      endpoints.push(raw);
      continue;
    }
    const choice = choices.change?.[id] ?? (entry.customized === true ? 'keep-mine' : 'take-new');
    if (choice === 'take-new') {
      endpoints.push(incoming);
      applied.taken.push(id);
    } else if (choice === 'merge') {
      endpoints.push(mergeEndpoint(mine, incoming));
      applied.merged.push(id);
    } else {
      // Seeing this version of the file is recorded, so the same file is not offered again as a change.
      endpoints.push({ ...mine, importedFrom: incoming.importedFrom });
      applied.kept.push(id);
    }
  }
  for (const entry of diff.added) {
    if (choices.add?.[entry.id] === false) continue;
    const incoming = nextById.get(entry.id);
    if (incoming === undefined) continue;
    endpoints.push(incoming);
    applied.added.push(entry.id);
  }
  next.endpoints = endpoints as RawDefinition['endpoints'];

  const notes: string[] = [];
  const firstImport = (definition.imports ?? []).length === 0 && (definition.endpoints ?? []).length === 0;
  if (imported.basePath !== undefined) {
    if (next.basePath === undefined && firstImport) next.basePath = imported.basePath;
    else if (next.basePath !== imported.basePath) notes.push(`The file's server path is ${imported.basePath}, but this backend's base path is ${next.basePath ?? 'empty'}. It was left as it is.`);
  }
  const format: ImportFormat = imported.format;
  next.imports = [...(next.imports ?? []), { source: source.slice(0, 2000), format, importedAt: now.toISOString(), hash: imported.hash }].slice(-MAX_IMPORT_RECORDS);
  return { definition: next, applied, notes };
}
