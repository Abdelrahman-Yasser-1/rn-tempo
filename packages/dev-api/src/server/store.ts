import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ApiConfig, Collection, Db, ResourceBinding } from '@rn-tempo/api-contract';
import type { Logger } from 'pino';

import { seedItems } from '../data.ts';

type Item = Record<string, unknown>;

export interface TokenRecord {
  username: string;
  kind: 'access' | 'refresh';
  expiresAt: number;
}

interface Persisted {
  version: 1;
  collections: Record<string, Item[]>;
  tokens: Record<string, TokenRecord>;
}

export const DB_FILE = 'db.json';

/**
 * Everything the server keeps: resource collections and mock-auth tokens (persisted to
 * `<dataDir>/db.json`) and the active scenarios (memory only, so a restart is always a clean slate
 * for responses).
 */
export class Store {
  readonly db: Db;
  private state: Persisted = { version: 1, collections: {}, tokens: {} };
  private readonly scenarios = new Map<string, string>();
  private readonly bindings: Map<string, ResourceBinding>;
  private readonly file: string;

  constructor(
    private readonly config: ApiConfig,
    private readonly dataDir: string,
    private readonly logger: Logger,
  ) {
    this.bindings = new Map(config.resources.map((r) => [r.name, r]));
    this.file = join(dataDir, DB_FILE);
    this.load();
    this.db = { collection: (name) => this.collection(name) };
  }

  private load(): void {
    mkdirSync(this.dataDir, { recursive: true });
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Persisted>;
      this.state = { version: 1, collections: parsed.collections ?? {}, tokens: parsed.tokens ?? {} };
    } catch (error) {
      // A half-written or hand-edited file must not take the server down; keep it for inspection.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      renameSync(this.file, backup);
      this.logger.warn({ backup, err: error instanceof Error ? error.message : String(error) }, 'db.json was unreadable and was moved aside');
    }
  }

  /** Writes the state atomically: a temp file in the same folder, then a rename. */
  private save(): void {
    const now = Date.now();
    for (const [token, record] of Object.entries(this.state.tokens)) {
      if (record.expiresAt <= now) delete this.state.tokens[token];
    }
    const temp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temp, this.file);
  }

  private rows(name: string): Item[] {
    const binding = this.bindings.get(name);
    if (binding === undefined) {
      throw new Error(`No resource "${name}". Declare it with resource("${name}", schema) in the config.`);
    }
    let rows = this.state.collections[name];
    if (rows === undefined) {
      rows = seedItems(binding, this.config.seed);
      this.state.collections[name] = rows;
      this.save();
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
      return numeric ? rows().reduce((max, row) => Math.max(max, row[idField] as number), 0) + 1 : randomUUID();
    };
    return {
      list: <T>() => structuredClone(rows()) as T[],
      get: <T>(id: string | number) => {
        const row = rows()[find(id)];
        return row === undefined ? undefined : (structuredClone(row) as T);
      },
      create: <T>(item: Item) => {
        const row = { ...item, [idField]: item[idField] ?? nextId() };
        rows().push(row);
        this.save();
        return structuredClone(row) as T;
      },
      update: <T>(id: string | number, patch: Item) => {
        const index = find(id);
        const row = rows()[index];
        if (row === undefined) return undefined;
        // The id never changes through a patch.
        const next = { ...row, ...patch, [idField]: row[idField] };
        rows()[index] = next;
        this.save();
        return structuredClone(next) as T;
      },
      remove: <T>(id: string | number) => {
        const index = find(id);
        if (index < 0) return undefined;
        const [removed] = rows().splice(index, 1);
        this.save();
        return structuredClone(removed) as T;
      },
    };
  }

  /** Drops every collection and seeds them again. Scenarios and tokens are kept. */
  reset(): void {
    this.state.collections = {};
    for (const name of this.bindings.keys()) this.rows(name);
    this.save();
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

  /** Issues an opaque token. It is random bytes, not a JWT, so nothing can be read from it. */
  issueToken(username: string, kind: TokenRecord['kind'], ttlMs: number): string {
    const token = `tempo_dev_${kind}_${randomBytes(24).toString('base64url')}`;
    this.state.tokens[token] = { username, kind, expiresAt: Date.now() + ttlMs };
    this.save();
    return token;
  }

  /** The record of a live token of the given kind, or undefined. */
  findToken(token: string, kind: TokenRecord['kind']): TokenRecord | undefined {
    const record = this.state.tokens[token];
    return record !== undefined && record.kind === kind && record.expiresAt > Date.now() ? record : undefined;
  }

  revokeToken(token: string): void {
    delete this.state.tokens[token];
    this.save();
  }
}
