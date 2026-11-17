import { watch, type FSWatcher } from 'node:fs';
import { basename } from 'node:path';

import type { Engine } from './engine.ts';
import { DEFINITION_FILE, readDefinitionText, serializeDefinition, writeFileAtomic } from './folder.ts';
import { DefinitionError, parseBackend, type BackendInput } from './schema.ts';
import { MigrationConfirmError, type Plan, type RenameHints } from './store.ts';

export type RawDefinition = BackendInput;
type Collections = NonNullable<RawDefinition['collections']>;
type Endpoints = NonNullable<RawDefinition['endpoints']>;
type RawCollection = Collections[number];
type RawField = NonNullable<RawCollection['fields']>[number];
type RawEndpoint = Endpoints[number];

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface ManagerOptions {
  /** Watch backend.json for edits. */
  watch?: boolean;
  debounceMs?: number;
  /** Told about reloads that were refused, so they reach engine.log. */
  onProblem?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface DefinitionChange {
  confirm?: boolean;
  hints?: RenameHints;
}

/**
 * Owns the definition on disk. Admin calls and file edits both end in `commit`, which validates, migrates the
 * database in one transaction, swaps the engine's routes, and keeps `backend.json` the same as what runs.
 */
export class Manager {
  readonly engine: Engine;
  private raw: RawDefinition;
  /** The text of backend.json as last read or written, so our own writes are not reloaded. */
  private lastText: string;
  private watcher: FSWatcher | undefined;
  private timer: NodeJS.Timeout | undefined;
  private readonly options: ManagerOptions;
  lastReloadError: string | undefined;

  constructor(engine: Engine, options: ManagerOptions = {}) {
    this.engine = engine;
    this.options = options;
    this.lastText = engine.folder.text;
    this.raw = JSON.parse(engine.folder.text) as RawDefinition;
  }

  /** The definition as written in backend.json. */
  definition(): RawDefinition {
    return structuredClone(this.raw);
  }

  /** Validates `next`, applies it to the database and routes, then writes it to disk. */
  async commit(next: unknown, change: DefinitionChange = {}): Promise<Plan> {
    const parsed = parseBackend(next, 'The definition');
    const plan = await this.engine.applyDefinition(parsed, change);
    const text = serializeDefinition(next as RawDefinition);
    writeFileAtomic(this.engine.folder.definitionPath, text);
    this.lastText = text;
    this.raw = JSON.parse(text) as RawDefinition;
    this.lastReloadError = undefined;
    return plan;
  }

  /** Copies the definition, lets `edit` change the copy, and commits it. */
  edit(edit: (draft: RawDefinition) => DefinitionChange | void, change: DefinitionChange = {}): Promise<Plan> {
    const draft = this.definition();
    const extra = edit(draft) ?? {};
    return this.commit(draft, { ...change, ...(extra.hints === undefined ? {} : { hints: extra.hints }) });
  }

  /** Re-reads backend.json. A bad or destructive edit is refused and the old definition keeps running. */
  async reloadFromDisk(): Promise<{ changed: boolean }> {
    let loaded;
    try {
      loaded = readDefinitionText(this.engine.folder.definitionPath);
    } catch (error) {
      this.refuse(error);
      throw error;
    }
    if (loaded.text === this.lastText) return { changed: false };
    try {
      await this.engine.applyDefinition(loaded.definition);
    } catch (error) {
      this.refuse(error);
      throw error;
    }
    this.lastText = loaded.text;
    this.raw = JSON.parse(loaded.text) as RawDefinition;
    this.lastReloadError = undefined;
    return { changed: true };
  }

  private refuse(error: unknown): void {
    const message =
      error instanceof MigrationConfirmError
        ? `backend.json would delete data (${error.lost.map((loss) => `${loss.collection}${loss.field === undefined ? '' : `.${loss.field}`}`).join(', ')}). Apply it from the app with confirm.`
        : error instanceof Error
          ? error.message
          : String(error);
    this.lastReloadError = message;
    this.options.onProblem?.('reload refused; the previous definition keeps running', { reason: message });
  }

  startWatching(): void {
    if (this.options.watch === false || this.watcher !== undefined) return;
    const delay = this.options.debounceMs ?? 200;
    this.watcher = watch(this.engine.folder.dir, { persistent: false }, (_event, filename) => {
      if (filename !== null && basename(String(filename)) !== DEFINITION_FILE) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.reloadFromDisk().catch(() => undefined), delay);
    });
    this.watcher.on('error', (error) => this.options.onProblem?.('file watcher failed', { reason: error.message }));
  }

  stopWatching(): void {
    clearTimeout(this.timer);
    this.watcher?.close();
    this.watcher = undefined;
  }

  // ---- collection and endpoint edits (all on a draft, then committed)

  private static collection(draft: RawDefinition, name: string): RawCollection {
    const found = (draft.collections ?? []).find((collection) => collection.name === name);
    if (found === undefined) throw new NotFoundError(`No collection "${name}".`);
    return found;
  }

  addCollection(collection: RawCollection, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => void (draft.collections = [...(draft.collections ?? []), collection]), change);
  }

  removeCollection(name: string, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      Manager.collection(draft, name);
      draft.collections = (draft.collections ?? []).filter((collection) => collection.name !== name);
    }, change);
  }

  renameCollection(name: string, to: string, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      Manager.collection(draft, name).name = to;
      for (const collection of draft.collections ?? []) {
        for (const field of collection.fields ?? []) if (field.relationTo === name) field.relationTo = to;
      }
      for (const endpoint of draft.endpoints ?? []) if (endpoint.type === 'crud' && endpoint.collection === name) endpoint.collection = to;
      return { hints: { collections: [{ from: name, to }] } };
    }, change);
  }

  addField(collectionName: string, field: RawField, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      const collection = Manager.collection(draft, collectionName);
      collection.fields = [...(collection.fields ?? []), field];
    }, change);
  }

  /** Replaces a field's settings (type, required, unique, default...). The name stays; use `renameField` to change it. */
  updateField(collectionName: string, fieldName: string, field: RawField, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      const collection = Manager.collection(draft, collectionName);
      const fields = collection.fields ?? [];
      const index = fields.findIndex((candidate) => candidate.name === fieldName);
      if (index < 0) throw new NotFoundError(`No field "${fieldName}" in "${collectionName}".`);
      fields[index] = { ...field, name: fieldName };
    }, change);
  }

  removeField(collectionName: string, fieldName: string, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      const collection = Manager.collection(draft, collectionName);
      if (!(collection.fields ?? []).some((field) => field.name === fieldName)) throw new NotFoundError(`No field "${fieldName}" in "${collectionName}".`);
      collection.fields = (collection.fields ?? []).filter((field) => field.name !== fieldName);
      for (const endpoint of draft.endpoints ?? []) {
        if (endpoint.type !== 'crud' || endpoint.collection !== collectionName) continue;
        if (endpoint.searchFields !== undefined) endpoint.searchFields = endpoint.searchFields.filter((name) => name !== fieldName);
        if (endpoint.hiddenFields !== undefined) endpoint.hiddenFields = endpoint.hiddenFields.filter((name) => name !== fieldName);
      }
    }, change);
  }

  renameField(collectionName: string, fieldName: string, to: string, change: DefinitionChange = {}): Promise<Plan> {
    return this.edit((draft) => {
      const collection = Manager.collection(draft, collectionName);
      const field = (collection.fields ?? []).find((candidate) => candidate.name === fieldName);
      if (field === undefined) throw new NotFoundError(`No field "${fieldName}" in "${collectionName}".`);
      field.name = to;
      for (const endpoint of draft.endpoints ?? []) {
        if (endpoint.type !== 'crud' || endpoint.collection !== collectionName) continue;
        for (const key of ['searchFields', 'hiddenFields'] as const) {
          endpoint[key] = endpoint[key]?.map((name) => (name === fieldName ? to : name));
        }
      }
      return { hints: { fields: [{ collection: collectionName, from: fieldName, to }] } };
    }, change);
  }

  addEndpoint(endpoint: RawEndpoint): Promise<Plan> {
    return this.edit((draft) => void (draft.endpoints = [...(draft.endpoints ?? []), endpoint]));
  }

  replaceEndpoint(id: string, endpoint: RawEndpoint): Promise<Plan> {
    return this.edit((draft) => {
      const endpoints = draft.endpoints ?? [];
      const index = endpoints.findIndex((candidate) => candidate.id === id);
      if (index < 0) throw new NotFoundError(`No endpoint "${id}".`);
      endpoints[index] = endpoint;
    });
  }

  removeEndpoint(id: string): Promise<Plan> {
    return this.edit((draft) => {
      if (!(draft.endpoints ?? []).some((candidate) => candidate.id === id)) throw new NotFoundError(`No endpoint "${id}".`);
      draft.endpoints = (draft.endpoints ?? []).filter((candidate) => candidate.id !== id);
    });
  }
}

export { DefinitionError };
