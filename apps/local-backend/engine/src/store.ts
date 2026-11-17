import { lstatSync } from 'node:fs';

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { quoteIdent, uniqueIndexName } from './names.ts';
import type { Collection, Field, FieldType } from './schema.ts';
import { decodeValue, encodeValue, validateRecord } from './values.ts';

const SQL_TYPES: Readonly<Record<FieldType, string>> = {
  string: 'TEXT',
  number: 'REAL',
  boolean: 'INTEGER',
  date: 'TEXT',
  enum: 'TEXT',
  json: 'TEXT',
  relation: 'INTEGER',
  media: 'TEXT',
};

export type Row = Record<string, unknown> & { id: number };

export type Op =
  | { op: 'createCollection'; collection: Collection }
  | { op: 'dropCollection'; name: string }
  | { op: 'renameCollection'; from: string; to: string }
  | { op: 'addField'; collection: string; field: Field }
  | { op: 'dropField'; collection: string; name: string }
  | { op: 'renameField'; collection: string; from: string; to: string }
  | { op: 'setUnique'; collection: string; field: string; unique: boolean };

/** What a destructive change would delete. */
export interface Loss {
  kind: 'collection' | 'field';
  collection: string;
  field?: string;
  /** Rows that would go (a collection) or values that would go (a field with data). */
  rows: number;
}

export interface Plan {
  ops: Op[];
  lost: Loss[];
}

/** Which names changed on purpose. A diff alone cannot tell a rename from a drop plus an add. */
export interface RenameHints {
  collections?: { from: string; to: string }[];
  /** `collection` is the collection's new name. */
  fields?: { collection: string; from: string; to: string }[];
}

export class MigrationConfirmError extends Error {
  readonly lost: Loss[];
  constructor(lost: Loss[]) {
    super('This change deletes data. Send confirm: true to apply it.');
    this.name = 'MigrationConfirmError';
    this.lost = lost;
  }
}

/** A migration the data does not allow, for example a new unique field over duplicate values. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

export class UniqueViolationError extends Error {
  readonly field: string | undefined;
  constructor(field: string | undefined) {
    super(field === undefined ? 'A unique value already exists.' : `The value of "${field}" already exists.`);
    this.name = 'UniqueViolationError';
    this.field = field;
  }
}

export interface ListQuery {
  /** Equality filters on fields. */
  where?: { field: string; value: string | number }[];
  /** Case-insensitive substring search over these fields. */
  search?: { fields: string[]; text: string };
  sort?: { field: string; desc: boolean }[];
  /** `undefined` returns every row. */
  limit?: number;
  skip?: number;
}

const columnDdl = (field: Field): string => `${quoteIdent(field.name)} ${SQL_TYPES[field.type]}`;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function uniqueField(error: unknown): UniqueViolationError | undefined {
  if (error instanceof Error && (error as { errcode?: unknown }).errcode === 2067) {
    const match = /UNIQUE constraint failed: [^.]+\.(\w+)/.exec(error.message);
    return new UniqueViolationError(match?.[1]);
  }
  return undefined;
}

export class Store {
  readonly db: DatabaseSync;
  private applied: Collection[];

  private constructor(db: DatabaseSync, applied: Collection[]) {
    this.db = db;
    this.applied = applied;
  }

  /** Opens (or creates) the database file in WAL mode. A path that is a symlink is refused. */
  static open(path: string): Store {
    if (path !== ':memory:') {
      // SQLite opens through links, so the file and its sidecars are checked first (a dangling link counts).
      for (const file of [path, `${path}-wal`, `${path}-shm`, `${path}-journal`]) {
        try {
          if (lstatSync(file).isSymbolicLink()) throw new MigrationError(`${file} is a symbolic link and is not used.`);
        } catch (error) {
          if (error instanceof MigrationError) throw error;
        }
      }
    }
    const db = new DatabaseSync(path, { timeout: 5000 });
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    db.exec('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const row = db.prepare("SELECT value FROM _meta WHERE key = 'schema'").get();
    const applied = row === undefined ? [] : (JSON.parse(String(row.value)) as Collection[]);
    return new Store(db, applied);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  /** The schema the database was last migrated to. */
  appliedSchema(): readonly Collection[] {
    return this.applied;
  }

  private collection(name: string): Collection {
    const found = this.applied.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`Unknown collection "${name}".`);
    return found;
  }

  private field(collection: Collection, name: string): Field {
    const found = collection.fields.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`Unknown field "${name}" in "${collection.name}".`);
    return found;
  }

  // ---- migrations

  private countRows(collection: string): number {
    return Number(this.db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(collection)}`).get()?.n ?? 0);
  }

  private countValues(collection: string, field: string): number {
    return Number(this.db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(collection)} WHERE ${quoteIdent(field)} IS NOT NULL`).get()?.n ?? 0);
  }

  /** The steps that bring the database to `target`, and what they would delete. Changes nothing. */
  plan(target: readonly Collection[], hints: RenameHints = {}): Plan {
    const ops: Op[] = [];
    const lost: Loss[] = [];
    const before = new Map(this.applied.map((collection) => [collection.name, collection]));
    const after = new Map(target.map((collection) => [collection.name, collection]));

    // Collection renames: only when the old name is gone from the target and the new one is not yet applied.
    const renamedFrom = new Map<string, string>(); // new name -> old name
    for (const hint of hints.collections ?? []) {
      if (before.has(hint.from) && !before.has(hint.to) && after.has(hint.to) && !after.has(hint.from)) {
        renamedFrom.set(hint.to, hint.from);
        ops.push({ op: 'renameCollection', from: hint.from, to: hint.to });
      }
    }
    const oldNameOf = (name: string): string => renamedFrom.get(name) ?? name;
    const kept = new Set([...after.keys()].map(oldNameOf));

    const columnOps: Op[] = [];
    const dropOps: Op[] = [];
    const addOps: Op[] = [];
    for (const [name, next] of after) {
      const previous = before.get(oldNameOf(name));
      if (previous === undefined) continue;
      const prevFields = new Map(previous.fields.map((field) => [field.name, field]));
      const nextFields = new Map(next.fields.map((field) => [field.name, field]));
      for (const hint of hints.fields ?? []) {
        if (hint.collection === name && prevFields.has(hint.from) && !prevFields.has(hint.to) && nextFields.has(hint.to) && !nextFields.has(hint.from)) {
          columnOps.push({ op: 'renameField', collection: name, from: hint.from, to: hint.to });
          const moved = prevFields.get(hint.from);
          prevFields.delete(hint.from);
          if (moved !== undefined) prevFields.set(hint.to, { ...moved, name: hint.to });
        }
      }
      // The table is called `name` once any collection rename has run, so field ops use the new name.
      for (const [fieldName, prev] of prevFields) {
        const now = nextFields.get(fieldName);
        if (now === undefined || now.type !== prev.type) {
          dropOps.push({ op: 'dropField', collection: name, name: fieldName });
          lost.push({ kind: 'field', collection: name, field: fieldName, rows: this.countValuesIn(oldNameOf(name), hints, fieldName, name) });
        }
      }
      for (const [fieldName, now] of nextFields) {
        const prev = prevFields.get(fieldName);
        if (prev === undefined || prev.type !== now.type) addOps.push({ op: 'addField', collection: name, field: now });
        else if (prev.unique !== now.unique) columnOps.push({ op: 'setUnique', collection: name, field: fieldName, unique: now.unique });
      }
    }
    ops.push(...columnOps, ...dropOps, ...addOps);

    for (const name of before.keys()) {
      if (!kept.has(name)) {
        ops.push({ op: 'dropCollection', name });
        lost.push({ kind: 'collection', collection: name, rows: this.countRows(name) });
      }
    }
    for (const [name, collection] of after) {
      if (!before.has(oldNameOf(name))) ops.push({ op: 'createCollection', collection });
    }
    return { ops, lost };
  }

  /** Counts stored values of a column using its name before any rename in this plan. */
  private countValuesIn(oldCollection: string, hints: RenameHints, field: string, newCollection: string): number {
    const oldField = (hints.fields ?? []).find((hint) => hint.collection === newCollection && hint.to === field)?.from ?? field;
    return this.countValues(oldCollection, oldField);
  }

  /**
   * Applies a plan in one transaction and records `target` as the applied schema. A plan that deletes data
   * needs `confirm`. `seedRows` gives the rows to insert into each newly created collection.
   */
  migrate(
    target: readonly Collection[],
    options: { hints?: RenameHints; confirm?: boolean; seedRows?: (collection: Collection) => Record<string, unknown>[] } = {},
  ): Plan {
    const plan = this.plan(target, options.hints);
    if (plan.lost.length > 0 && options.confirm !== true) throw new MigrationConfirmError(plan.lost);
    this.db.exec('BEGIN IMMEDIATE');
    this.pendingTarget = target;
    try {
      for (const op of plan.ops) this.run(op);
      this.applied = structuredClone(target) as Collection[];
      for (const op of plan.ops) {
        if (op.op !== 'createCollection') continue;
        const rows = options.seedRows?.(op.collection) ?? [];
        rows.forEach((row, index) => this.insertSeed(op.collection, row, index));
      }
      this.db.prepare("INSERT INTO _meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(target));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.applied = this.readApplied();
      if (error instanceof MigrationError || error instanceof MigrationConfirmError) throw error;
      if (uniqueField(error) !== undefined) throw new MigrationError('Existing rows have duplicate values, so the field cannot be unique.');
      throw error;
    }
    return plan;
  }

  private readApplied(): Collection[] {
    const row = this.db.prepare("SELECT value FROM _meta WHERE key = 'schema'").get();
    return row === undefined ? [] : (JSON.parse(String(row.value)) as Collection[]);
  }

  private run(op: Op): void {
    switch (op.op) {
      case 'createCollection': {
        const columns = ['"id" INTEGER PRIMARY KEY AUTOINCREMENT', ...op.collection.fields.map(columnDdl)];
        this.db.exec(`CREATE TABLE ${quoteIdent(op.collection.name)} (${columns.join(', ')})`);
        for (const field of op.collection.fields) if (field.unique) this.createIndex(op.collection.name, field.name);
        return;
      }
      case 'dropCollection':
        this.db.exec(`DROP TABLE ${quoteIdent(op.name)}`);
        return;
      case 'renameCollection': {
        const from = this.applied.find((collection) => collection.name === op.from);
        for (const field of from?.fields ?? []) if (field.unique) this.db.exec(`DROP INDEX IF EXISTS ${uniqueIndexName(op.from, field.name)}`);
        this.db.exec(`ALTER TABLE ${quoteIdent(op.from)} RENAME TO ${quoteIdent(op.to)}`);
        for (const field of from?.fields ?? []) if (field.unique) this.createIndex(op.to, field.name);
        return;
      }
      case 'addField':
        this.db.exec(`ALTER TABLE ${quoteIdent(op.collection)} ADD COLUMN ${columnDdl(op.field)}`);
        if (op.field.default !== undefined && op.field.default !== null) {
          this.db
            .prepare(`UPDATE ${quoteIdent(op.collection)} SET ${quoteIdent(op.field.name)} = ?`)
            .run(encodeValue(op.field, op.field.default));
        }
        if (op.field.unique) this.createIndex(op.collection, op.field.name);
        return;
      case 'dropField':
        // The column's unique index has to go first; SQLite refuses to drop an indexed column.
        this.db.exec(`DROP INDEX IF EXISTS ${uniqueIndexName(op.collection, op.name)}`);
        this.db.exec(`ALTER TABLE ${quoteIdent(op.collection)} DROP COLUMN ${quoteIdent(op.name)}`);
        return;
      case 'renameField':
        this.db.exec(`DROP INDEX IF EXISTS ${uniqueIndexName(op.collection, op.from)}`);
        this.db.exec(`ALTER TABLE ${quoteIdent(op.collection)} RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)}`);
        // Re-created below when the target field is unique (a setUnique op is not emitted for a pure rename).
        if (this.targetUnique(op.collection, op.to)) this.createIndex(op.collection, op.to);
        return;
      case 'setUnique':
        if (op.unique) this.createIndex(op.collection, op.field);
        else this.db.exec(`DROP INDEX IF EXISTS ${uniqueIndexName(op.collection, op.field)}`);
        return;
    }
  }

  /** Set while a migration runs: the schema being migrated to, so a rename knows whether to re-index. */
  private pendingTarget: readonly Collection[] = [];
  private targetUnique(collection: string, field: string): boolean {
    return this.pendingTarget.find((candidate) => candidate.name === collection)?.fields.find((candidate) => candidate.name === field)?.unique === true;
  }

  private createIndex(table: string, column: string): void {
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${uniqueIndexName(table, column)} ON ${quoteIdent(table)} (${quoteIdent(column)})`);
  }

  private insertSeed(collection: Collection, row: Record<string, unknown>, index: number): void {
    const checked = validateRecord(collection, row, {
      mode: 'create',
      unknownFields: 'reject',
      allowId: true,
      part: `seed[${index}]`,
      exists: () => true,
    });
    if (checked.issues.length > 0) {
      throw new MigrationError(`Seed row for "${collection.name}" is invalid: ${checked.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
    }
    this.insertRow(collection, checked.values, checked.id);
  }

  // ---- data

  private insertRow(collection: Collection, values: Record<string, unknown>, id?: number): number {
    const names = Object.keys(values);
    const columns = names.map((name) => quoteIdent(name));
    const params: SQLInputValue[] = names.map((name) => encodeValue(this.field(collection, name), values[name]));
    if (id !== undefined) {
      columns.unshift('"id"');
      params.unshift(id);
    }
    const table = quoteIdent(collection.name);
    const sql =
      columns.length === 0
        ? `INSERT INTO ${table} DEFAULT VALUES`
        : `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    return Number(this.db.prepare(sql).run(...params).lastInsertRowid);
  }

  private decode(collection: Collection, raw: Record<string, unknown>): Row {
    const row: Record<string, unknown> = { id: Number(raw.id) };
    for (const field of collection.fields) row[field.name] = decodeValue(field, raw[field.name]);
    return row as Row;
  }

  has(collectionName: string, id: number): boolean {
    const collection = this.applied.find((candidate) => candidate.name === collectionName);
    if (collection === undefined) return false;
    return this.db.prepare(`SELECT 1 AS found FROM ${quoteIdent(collection.name)} WHERE id = ?`).get(id) !== undefined;
  }

  count(collectionName: string): number {
    return this.countRows(this.collection(collectionName).name);
  }

  get(collectionName: string, id: number): Row | undefined {
    const collection = this.collection(collectionName);
    const raw = this.db.prepare(`SELECT * FROM ${quoteIdent(collection.name)} WHERE id = ?`).get(id);
    return raw === undefined ? undefined : this.decode(collection, raw);
  }

  list(collectionName: string, query: ListQuery = {}): { rows: Row[]; total: number } {
    const collection = this.collection(collectionName);
    const table = quoteIdent(collection.name);
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    for (const filter of query.where ?? []) {
      const field = filter.field === 'id' ? undefined : this.field(collection, filter.field);
      clauses.push(`${quoteIdent(filter.field === 'id' ? 'id' : filter.field)} = ?`);
      params.push(field === undefined ? filter.value : field.type === 'boolean' ? (filter.value === 1 || filter.value === 'true' ? 1 : 0) : filter.value);
    }
    if (query.search !== undefined && query.search.fields.length > 0 && query.search.text !== '') {
      const like = `%${escapeLike(query.search.text)}%`;
      clauses.push(`(${query.search.fields.map((name) => `${quoteIdent(this.field(collection, name).name)} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      for (const _ of query.search.fields) params.push(like);
    }
    const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}${where}`).get(...params)?.n ?? 0);
    const order = (query.sort ?? [])
      .map((sort) => `${quoteIdent(sort.field === 'id' ? 'id' : this.field(collection, sort.field).name)} ${sort.desc ? 'DESC' : 'ASC'}`)
      .concat(['"id" ASC'])
      .join(', ');
    const limit = query.limit === undefined ? ' LIMIT -1' : ' LIMIT ?';
    const rowParams = [...params, ...(query.limit === undefined ? [] : [query.limit]), query.skip ?? 0];
    const raws = this.db.prepare(`SELECT * FROM ${table}${where} ORDER BY ${order}${limit} OFFSET ?`).all(...rowParams);
    return { rows: raws.map((raw) => this.decode(collection, raw)), total };
  }

  /** Inserts validated values and returns the new row. Throws UniqueViolationError on a duplicate. */
  insert(collectionName: string, values: Record<string, unknown>): Row {
    const collection = this.collection(collectionName);
    try {
      const id = this.insertRow(collection, values);
      return this.get(collectionName, id) as Row;
    } catch (error) {
      throw uniqueField(error) ?? error;
    }
  }

  /** Writes the given columns of one row. Returns the row, or undefined when the id does not exist. */
  update(collectionName: string, id: number, values: Record<string, unknown>): Row | undefined {
    const collection = this.collection(collectionName);
    const names = Object.keys(values);
    try {
      if (names.length > 0) {
        const sets = names.map((name) => `${quoteIdent(this.field(collection, name).name)} = ?`).join(', ');
        const params = names.map((name) => encodeValue(this.field(collection, name), values[name]));
        this.db.prepare(`UPDATE ${quoteIdent(collection.name)} SET ${sets} WHERE id = ?`).run(...params, id);
      }
    } catch (error) {
      throw uniqueField(error) ?? error;
    }
    return this.get(collectionName, id);
  }

  remove(collectionName: string, id: number): boolean {
    const collection = this.collection(collectionName);
    return Number(this.db.prepare(`DELETE FROM ${quoteIdent(collection.name)} WHERE id = ?`).run(id).changes) > 0;
  }
}
