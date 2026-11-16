import type { ApiConfig, Collection, Db, ResourceBinding } from '@rn-tempo/api-contract';

export type Item = Record<string, unknown>;

export interface TokenRecord {
  username: string;
  kind: 'access' | 'refresh';
  expiresAt: number;
}

/** What a store keeps and what the server layer writes to `db.json`. */
export interface StoreState {
  version: 1;
  collections: Record<string, Item[]>;
  tokens: Record<string, TokenRecord>;
}

export interface StoreOptions {
  /**
   * Builds the first items of a resource whose `seed` is a count. Generated data needs faker, so
   * the Node server passes it in; without it only resources with listed items can be seeded.
   */
  seedItems?: (binding: ResourceBinding, seed: number) => Item[];
  /** Id of a new item of a resource with non-numeric ids. */
  newId?: () => string;
  /** The random part of a mock token. Use a cryptographic source in a server. */
  randomToken?: () => string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function randomText(length: number): string {
  let out = '';
  while (out.length < length) out += Math.random().toString(36).slice(2);
  return out.slice(0, length);
}

/** Items the config lists. A count needs a generator, which only the Node server provides. */
function listedItems(binding: ResourceBinding): Item[] {
  if (typeof binding.seed !== 'number') return binding.seed.map((item) => ({ ...item }));
  throw new Error(
    `Resource "${binding.name}" seeds ${binding.seed} generated items, which needs the dev API server. List its items in the config to use it without a server.`,
  );
}

/**
 * Everything the dev API keeps in memory: resource collections, mock-auth tokens and the active
 * scenarios. It has no Node dependency, so it runs in Jest and in the app. The Node server extends
 * it and writes the state to disk in `changed()`.
 */
export class MemoryStore {
  readonly db: Db;
  protected state: StoreState = { version: 1, collections: {}, tokens: {} };
  private readonly scenarios = new Map<string, string>();
  private readonly bindings: Map<string, ResourceBinding>;
  private readonly config: ApiConfig;
  private readonly options: StoreOptions;

  constructor(config: ApiConfig, options: StoreOptions = {}) {
    this.config = config;
    this.options = options;
    this.bindings = new Map(config.resources.map((r) => [r.name, r]));
    this.db = { collection: (name) => this.collection(name) };
  }

  /** Called after every write. The server layer saves the state here; expired tokens are dropped first. */
  protected changed(): void {
    const now = Date.now();
    for (const [token, record] of Object.entries(this.state.tokens)) {
      if (record.expiresAt <= now) delete this.state.tokens[token];
    }
  }

  private rows(name: string): Item[] {
    const binding = this.bindings.get(name);
    if (binding === undefined) {
      throw new Error(`No resource "${name}". Declare it with resource("${name}", schema) in the config.`);
    }
    let rows = this.state.collections[name];
    if (rows === undefined) {
      rows = (this.options.seedItems ?? listedItems)(binding, this.config.seed);
      this.state.collections[name] = rows;
      this.changed();
    }
    return rows;
  }

  /** The collection of a resource. Seeded the first time it is used. */
  collection(name: string): Collection {
    const binding = this.bindings.get(name);
    const rows = (): Item[] => this.rows(name);
    const idField = binding?.idField ?? 'id';
    const find = (id: string | number): number => rows().findIndex((row) => String(row[idField]) === String(id));
    const nextId = (): unknown => {
      const numeric = rows().every((row) => typeof row[idField] === 'number');
      if (numeric) return rows().reduce((max, row) => Math.max(max, row[idField] as number), 0) + 1;
      return (this.options.newId ?? (() => randomText(16)))();
    };
    return {
      list: <T>() => clone(rows()) as T[],
      get: <T>(id: string | number) => {
        const row = rows()[find(id)];
        return row === undefined ? undefined : (clone(row) as T);
      },
      create: <T>(item: Item) => {
        const row = { ...item, [idField]: item[idField] ?? nextId() };
        rows().push(row);
        this.changed();
        return clone(row) as T;
      },
      update: <T>(id: string | number, patch: Item) => {
        const index = find(id);
        const row = rows()[index];
        if (row === undefined) return undefined;
        // The id never changes through a patch.
        const next = { ...row, ...patch, [idField]: row[idField] };
        rows()[index] = next;
        this.changed();
        return clone(next) as T;
      },
      remove: <T>(id: string | number) => {
        const index = find(id);
        if (index < 0) return undefined;
        const [removed] = rows().splice(index, 1);
        this.changed();
        return clone(removed) as T;
      },
    };
  }

  /** Drops every collection and seeds them again. Scenarios and tokens are kept. */
  reset(): void {
    this.state.collections = {};
    for (const name of this.bindings.keys()) this.rows(name);
    this.changed();
  }

  // ---- scenarios (memory only)

  setScenario(endpointId: string, name: string): void {
    this.scenarios.set(endpointId, name);
  }

  clearScenario(endpointId?: string): void {
    if (endpointId === undefined) this.scenarios.clear();
    else this.scenarios.delete(endpointId);
  }

  scenarioFor(endpointId: string): string | undefined {
    return this.scenarios.get(endpointId);
  }

  activeScenarios(): Record<string, string> {
    return Object.fromEntries(this.scenarios);
  }

  // ---- mock-auth tokens

  /** Issues an opaque token. It is random text, not a JWT, so nothing can be read from it. */
  issueToken(username: string, kind: TokenRecord['kind'], ttlMs: number): string {
    const token = `tempo_dev_${kind}_${(this.options.randomToken ?? (() => randomText(32)))()}`;
    this.state.tokens[token] = { username, kind, expiresAt: Date.now() + ttlMs };
    this.changed();
    return token;
  }

  /** The record of a live token of the given kind, or undefined. */
  findToken(token: string, kind: TokenRecord['kind']): TokenRecord | undefined {
    const record = this.state.tokens[token];
    return record !== undefined && record.kind === kind && record.expiresAt > Date.now() ? record : undefined;
  }

  revokeToken(token: string): void {
    delete this.state.tokens[token];
    this.changed();
  }
}
