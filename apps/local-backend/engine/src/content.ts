import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { isBlankValue, isSlug, missingRequired, SLUG_HELP, validateLocaleData, type ContentIssue } from './content-values.ts';
import type { Backend, ContentType } from './schema.ts';
import { MigrationError, type Loss, type RenameHints } from './store.ts';

/** How many versions of one entry are kept (the oldest go first). */
export const VERSIONS_KEPT = 10;
const MODEL_KEY = 'content_schema';

export type EntryStatus = 'draft' | 'published' | 'scheduled';
/** Per locale, the field values of an entry. A type that is not localized only has the default locale. */
export type LocaleValues = Record<string, Record<string, unknown>>;

export interface EntryRow {
  id: number;
  type: string;
  slug: string | null;
  status: EntryStatus;
  /** When it went (or goes) live: set by publish and schedule, cleared by unpublish. */
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Counts every change of the content, so a client can tell an entry changed. */
  version: number;
}

export interface EntryDetail extends EntryRow {
  values: LocaleValues;
}

export interface VersionInfo {
  /** The entry's `version` when this was saved. Unique per entry. */
  version: number;
  reason: 'create' | 'save' | 'revert';
  savedAt: string;
  slug: string | null;
  /** The locales that had values in this version. */
  locales: string[];
}

/** The part of a backend definition that content depends on. */
export interface ContentModel {
  types: ContentType[];
  locales: string[];
  defaultLocale: string;
}

export const modelOf = (definition: Pick<Backend, 'contentTypes' | 'content'>): ContentModel => ({
  types: definition.contentTypes,
  locales: definition.content.locales,
  defaultLocale: definition.content.defaultLocale,
});

/** A content problem with the HTTP status it should answer. */
export class ContentError extends Error {
  readonly status: number;
  readonly issues: ContentIssue[];
  constructor(status: number, message: string, issues: ContentIssue[] = []) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
    this.issues = issues;
  }
}

export interface ContentPlan {
  lost: Loss[];
  /** Applies the plan. Call it inside the transaction of the collection migration. */
  run(): void;
}

export function migrateContentTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _content_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      slug TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
      publishAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS _content_entries_slug ON _content_entries (type, slug) WHERE slug IS NOT NULL;
    CREATE INDEX IF NOT EXISTS _content_entries_status ON _content_entries (type, status, publishAt);
    CREATE TABLE IF NOT EXISTS _content_values (
      entryId INTEGER NOT NULL REFERENCES _content_entries(id) ON DELETE CASCADE,
      locale TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (entryId, locale)
    );
    CREATE TABLE IF NOT EXISTS _content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entryId INTEGER NOT NULL REFERENCES _content_entries(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      reason TEXT NOT NULL,
      slug TEXT,
      savedAt TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS _content_versions_entry ON _content_versions (entryId, id);
  `);
}

const parseData = (text: unknown): Record<string, unknown> => {
  try {
    const value = JSON.parse(String(text)) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const toRow = (raw: Record<string, unknown>): EntryRow => ({
  id: Number(raw.id),
  type: String(raw.type),
  slug: raw.slug === null ? null : String(raw.slug),
  status: String(raw.status) as EntryStatus,
  publishAt: raw.publishAt === null ? null : String(raw.publishAt),
  createdAt: String(raw.createdAt),
  updatedAt: String(raw.updatedAt),
  version: Number(raw.version),
});

const isUniqueViolation = (error: unknown): boolean => error instanceof Error && (error as { errcode?: unknown }).errcode === 2067;

/** The type's name for a list: its first one-line or long text value (default locale first). */
export function titleOf(type: ContentType | undefined, values: LocaleValues, defaultLocale: string): string | null {
  const field = type?.fields.find((candidate) => candidate.type === 'string') ?? type?.fields.find((candidate) => candidate.type === 'text');
  if (field === undefined) return null;
  for (const data of [values[defaultLocale], ...Object.values(values)]) {
    const value = data?.[field.name];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

export interface ListEntriesQuery {
  type?: string;
  status?: EntryStatus;
  q?: string;
  skip?: number;
  limit?: number;
}

/**
 * Content in SQLite: entries (`_content_entries`), their values per locale (`_content_values`) and the last
 * `VERSIONS_KEPT` versions of each entry (`_content_versions`). Every statement is fixed text with bound parameters.
 */
export class ContentService {
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(db: DatabaseSync, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private inTransaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // ---- migrations

  /** The model the database was last migrated to, or `undefined` for a database that never had one. */
  applied(): ContentModel | undefined {
    const row = this.db.prepare('SELECT value FROM _meta WHERE key = ?').get(MODEL_KEY);
    return row === undefined ? undefined : (JSON.parse(String(row.value)) as ContentModel);
  }

  private valueRowsOf(type: string): { entryId: number; locale: string; data: Record<string, unknown> }[] {
    return this.db
      .prepare('SELECT v.entryId, v.locale, v.data FROM _content_values v JOIN _content_entries e ON e.id = v.entryId WHERE e.type = ?')
      .all(type)
      .map((raw) => ({ entryId: Number(raw.entryId), locale: String(raw.locale), data: parseData(raw.data) }));
  }

  /** Rewrites the value rows of a type; `change` edits the data in place and says whether it did. */
  private rewrite(type: string, change: (data: Record<string, unknown>) => boolean): void {
    const update = this.db.prepare('UPDATE _content_values SET data = ? WHERE entryId = ? AND locale = ?');
    for (const row of this.valueRowsOf(type)) if (change(row.data)) update.run(JSON.stringify(row.data), row.entryId, row.locale);
  }

  private count(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).get(...params)?.n ?? 0);
  }

  /**
   * What it takes to bring the content tables to `next`: values of removed or retyped fields are dropped, a
   * renamed field's values move, a type that stops being localized keeps only the default locale, a removed locale's
   * values go, and a new type gets its seed entries. Changes nothing; `run()` does.
   */
  plan(next: ContentModel, renames: NonNullable<RenameHints['contentFields']> = []): ContentPlan {
    const before = this.applied() ?? { types: [], locales: next.locales, defaultLocale: next.defaultLocale };
    const lost: Loss[] = [];
    const steps: (() => void)[] = [];
    const nextByName = new Map(next.types.map((type) => [type.name, type]));
    const beforeByName = new Map(before.types.map((type) => [type.name, type]));
    const total = (type: string): number => this.count('SELECT COUNT(*) AS n FROM _content_entries WHERE type = ?', type);

    for (const type of before.types) {
      if (nextByName.has(type.name)) continue;
      lost.push({ kind: 'contentType', collection: type.name, rows: total(type.name) });
      steps.push(() => void this.db.prepare('DELETE FROM _content_entries WHERE type = ?').run(type.name));
    }

    const moveDefault = before.defaultLocale !== next.defaultLocale;
    for (const type of next.types) {
      const previous = beforeByName.get(type.name);
      if (previous === undefined) continue;
      if (type.singleton === true && previous.singleton !== true && total(type.name) > 1) {
        throw new MigrationError(`"${type.name}" has ${String(total(type.name))} entries; a singleton holds one. Delete the others first.`);
      }
      const prevFields = new Map(previous.fields.map((field) => [field.name, field]));
      const nextFields = new Map(type.fields.map((field) => [field.name, field]));
      for (const hint of renames) {
        if (hint.type !== type.name || !prevFields.has(hint.from) || prevFields.has(hint.to) || !nextFields.has(hint.to) || nextFields.has(hint.from)) continue;
        steps.push(() =>
          this.rewrite(type.name, (data) => {
            if (!(hint.from in data)) return false;
            data[hint.to] = data[hint.from];
            delete data[hint.from];
            return true;
          }),
        );
        const moved = prevFields.get(hint.from);
        prevFields.delete(hint.from);
        if (moved !== undefined) prevFields.set(hint.to, { ...moved, name: hint.to });
      }
      for (const [name, field] of prevFields) {
        const now = nextFields.get(name);
        if (now !== undefined && now.type === field.type) continue;
        const rows = this.valueRowsOf(type.name).filter((row) => !isBlankValue(row.data[name])).length;
        lost.push({ kind: 'contentField', collection: type.name, field: name, rows });
        steps.push(() =>
          this.rewrite(type.name, (data) => {
            if (!(name in data)) return false;
            delete data[name];
            return true;
          }),
        );
      }
      for (const [name, field] of nextFields) {
        const was = prevFields.get(name);
        if ((was !== undefined && was.type === field.type) || field.default === undefined || field.default === null) continue;
        steps.push(() =>
          this.rewrite(type.name, (data) => {
            if (name in data) return false;
            data[name] = structuredClone(field.default);
            return true;
          }),
        );
      }
      if (previous.localized === true && type.localized !== true) {
        const rows = this.valueRowsOf(type.name).filter((row) => row.locale !== before.defaultLocale).length;
        if (rows > 0) lost.push({ kind: 'contentLocale', collection: type.name, rows });
        steps.push(
          () =>
            void this.db
              .prepare('DELETE FROM _content_values WHERE locale <> ? AND entryId IN (SELECT id FROM _content_entries WHERE type = ?)')
              .run(before.defaultLocale, type.name),
        );
      }
    }

    if (moveDefault) {
      // Values of types that are not localized live under the default locale, so they follow it.
      const unlocalized = next.types.filter((type) => type.localized !== true && beforeByName.has(type.name)).map((type) => type.name);
      steps.push(() => {
        for (const name of unlocalized) {
          this.db
            .prepare('UPDATE OR IGNORE _content_values SET locale = ? WHERE locale = ? AND entryId IN (SELECT id FROM _content_entries WHERE type = ?)')
            .run(next.defaultLocale, before.defaultLocale, name);
        }
      });
    }
    for (const locale of before.locales) {
      if (next.locales.includes(locale)) continue;
      // A removed default locale that unlocalized values are moving out of is not a loss of those values.
      const skipUnlocalized = moveDefault && locale === before.defaultLocale;
      const unlocalized = skipUnlocalized ? before.types.filter((type) => type.localized !== true).map((type) => type.name) : [];
      const rows = this.db
        .prepare('SELECT v.locale, e.type FROM _content_values v JOIN _content_entries e ON e.id = v.entryId WHERE v.locale = ?')
        .all(locale)
        .filter((row) => !unlocalized.includes(String(row.type))).length;
      if (rows > 0) lost.push({ kind: 'contentLocale', collection: '', locale, rows });
      steps.push(() => void this.db.prepare('DELETE FROM _content_values WHERE locale = ?').run(locale));
    }

    const added = next.types.filter((type) => !beforeByName.has(type.name));
    for (const type of added) {
      for (const entry of type.seed ?? []) {
        const issues = this.checkSeed(next, type, entry.values);
        if (issues.length > 0) throw new MigrationError(`Seed entry of "${type.name}" is invalid: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
      }
    }
    const model: ContentModel = { ...next, types: next.types.map(({ seed: _seed, ...type }) => type) };
    return {
      lost,
      run: () => {
        for (const step of steps) step();
        for (const type of added) {
          for (const entry of type.seed ?? []) {
            this.insertEntry(type, { slug: entry.slug ?? null, status: entry.status, values: entry.values });
          }
        }
        this.db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(MODEL_KEY, JSON.stringify(model));
      },
    };
  }

  private checkSeed(model: ContentModel, type: ContentType, values: LocaleValues): ContentIssue[] {
    return this.checkValues(model, type, values, {}).issues;
  }

  // ---- reading

  private row(id: number): EntryRow | undefined {
    const raw = this.db.prepare('SELECT * FROM _content_entries WHERE id = ?').get(id);
    return raw === undefined ? undefined : toRow(raw);
  }

  /** The values of entries, by entry id. */
  valuesOf(ids: readonly number[]): Map<number, LocaleValues> {
    const out = new Map<number, LocaleValues>(ids.map((id) => [id, {}]));
    if (ids.length === 0) return out;
    const rows = this.db.prepare(`SELECT entryId, locale, data FROM _content_values WHERE entryId IN (${ids.map(() => '?').join(', ')}) ORDER BY locale`).all(...ids);
    for (const raw of rows) {
      const values = out.get(Number(raw.entryId));
      if (values !== undefined) values[String(raw.locale)] = parseData(raw.data);
    }
    return out;
  }

  private detailOf(row: EntryRow): EntryDetail {
    return { ...row, values: this.valuesOf([row.id]).get(row.id) ?? {} };
  }

  find(id: number): EntryRow | undefined {
    this.publishDue();
    return this.row(id);
  }

  detail(id: number): EntryDetail | undefined {
    const row = this.find(id);
    return row === undefined ? undefined : this.detailOf(row);
  }

  countEntries(type?: string): number {
    return type === undefined ? this.count('SELECT COUNT(*) AS n FROM _content_entries') : this.count('SELECT COUNT(*) AS n FROM _content_entries WHERE type = ?', type);
  }

  /** Entries for the admin, newest edit first. `q` looks at the title. */
  list(model: ContentModel, query: ListEntriesQuery = {}): { items: (EntryRow & { title: string | null; locales: string[] })[]; total: number } {
    this.publishDue();
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (query.type !== undefined) {
      clauses.push('type = ?');
      params.push(query.type);
    }
    if (query.status !== undefined) {
      clauses.push('status = ?');
      params.push(query.status);
    }
    const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
    const rows = this.db.prepare(`SELECT * FROM _content_entries${where} ORDER BY updatedAt DESC, id DESC`).all(...params).map(toRow);
    const values = this.valuesOf(rows.map((row) => row.id));
    const needle = (query.q ?? '').trim().toLowerCase();
    const items = rows
      .map((row) => {
        const own = values.get(row.id) ?? {};
        const type = model.types.find((candidate) => candidate.name === row.type);
        const locales = model.locales.filter((locale) => Object.values(own[locale] ?? {}).some((value) => !isBlankValue(value)));
        return { ...row, title: titleOf(type, own, model.defaultLocale), locales };
      })
      .filter((item) => needle === '' || (item.title ?? '').toLowerCase().includes(needle) || (item.slug ?? '').toLowerCase().includes(needle));
    const skip = query.skip ?? 0;
    return { items: query.limit === undefined ? items.slice(skip) : items.slice(skip, skip + query.limit), total: items.length };
  }

  // ---- writing

  private typeOf(model: ContentModel, name: string): ContentType {
    const type = model.types.find((candidate) => candidate.name === name);
    if (type === undefined) throw new ContentError(404, `No content type "${name}".`);
    return type;
  }

  /** Checks `{ locale: data }` for a type: known locales, known fields, the right shapes. `null` for a locale deletes it. */
  checkValues(
    model: ContentModel,
    type: ContentType,
    values: unknown,
    options: { mediaExists?: (id: string) => boolean },
  ): { values: Record<string, Record<string, unknown> | null>; issues: ContentIssue[] } {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) return { values: {}, issues: [{ path: 'values', message: 'Send an object with one entry per locale.' }] };
    const issues: ContentIssue[] = [];
    const out: Record<string, Record<string, unknown> | null> = {};
    for (const [locale, data] of Object.entries(values)) {
      const known = type.localized === true ? model.locales.includes(locale) : locale === model.defaultLocale;
      if (!known) {
        issues.push({
          path: `values.${locale}`,
          message: type.localized === true ? `Unknown locale "${locale}". Use one of: ${model.locales.join(', ')}.` : `"${type.name}" is not localized: use the default locale "${model.defaultLocale}".`,
        });
        continue;
      }
      if (data === null) {
        out[locale] = null;
        continue;
      }
      const checked = validateLocaleData(type, data, `values.${locale}`, options);
      issues.push(...checked.issues);
      out[locale] = checked.data;
    }
    return { values: out, issues };
  }

  private writeValues(id: number, values: Record<string, Record<string, unknown> | null>): void {
    for (const [locale, data] of Object.entries(values)) {
      if (data === null || Object.keys(data).length === 0) this.db.prepare('DELETE FROM _content_values WHERE entryId = ? AND locale = ?').run(id, locale);
      else {
        this.db
          .prepare('INSERT INTO _content_values (entryId, locale, data) VALUES (?, ?, ?) ON CONFLICT(entryId, locale) DO UPDATE SET data = excluded.data')
          .run(id, locale, JSON.stringify(data));
      }
    }
  }

  private snapshot(id: number, reason: VersionInfo['reason']): void {
    const row = this.row(id);
    if (row === undefined) return;
    const values = this.valuesOf([id]).get(id) ?? {};
    this.db
      .prepare('INSERT INTO _content_versions (entryId, version, reason, slug, savedAt, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, row.version, reason, row.slug, this.stamp(), JSON.stringify(values));
    this.db
      .prepare('DELETE FROM _content_versions WHERE entryId = ? AND id NOT IN (SELECT id FROM _content_versions WHERE entryId = ? ORDER BY id DESC LIMIT ?)')
      .run(id, id, VERSIONS_KEPT);
  }

  private checkSlug(slug: unknown): string | null {
    if (slug === undefined || slug === null || slug === '') return null;
    if (typeof slug !== 'string' || !isSlug(slug)) throw new ContentError(400, `slug: ${SLUG_HELP}`, [{ path: 'slug', message: SLUG_HELP }]);
    return slug;
  }

  private slugTaken(type: string): ContentError {
    return new ContentError(409, `That slug is already used by another "${type}" entry.`, [{ path: 'slug', message: 'Already exists.' }]);
  }

  /** Inserts an entry and its first version. No transaction of its own: the caller has one. */
  private insertEntry(type: ContentType, input: { slug: string | null; status: 'draft' | 'published'; values: LocaleValues }): number {
    const now = this.stamp();
    const id = Number(
      this.db
        .prepare('INSERT INTO _content_entries (type, slug, status, publishAt, createdAt, updatedAt, version) VALUES (?, ?, ?, ?, ?, ?, 1)')
        .run(type.name, input.slug, input.status, input.status === 'published' ? now : null, now, now).lastInsertRowid,
    );
    this.writeValues(id, input.values);
    this.snapshot(id, 'create');
    return id;
  }

  create(model: ContentModel, input: { type: string; slug?: unknown; values?: unknown }, options: { mediaExists?: (id: string) => boolean } = {}): EntryDetail {
    const type = this.typeOf(model, input.type);
    const slug = this.checkSlug(input.slug);
    const checked = this.checkValues(model, type, input.values ?? {}, options);
    if (checked.issues.length > 0) throw this.invalid(checked.issues);
    if (type.singleton === true && this.countEntries(type.name) > 0) throw new ContentError(409, `"${type.name}" is a singleton and already has its entry. Edit that one.`);
    try {
      const id = this.inTransaction(() => this.insertEntry(type, { slug, status: 'draft', values: checked.values as LocaleValues }));
      return this.detailOf(this.row(id) as EntryRow);
    } catch (error) {
      if (isUniqueViolation(error)) throw this.slugTaken(type.name);
      throw error;
    }
  }

  private invalid(issues: ContentIssue[]): ContentError {
    return new ContentError(400, `${issues[0]?.path ?? 'body'}: ${issues[0]?.message ?? 'Invalid.'}`, issues);
  }

  private mustFind(id: number): EntryRow {
    const row = this.find(id);
    if (row === undefined) throw new ContentError(404, `No entry ${String(id)}.`);
    return row;
  }

  /** Saves the slug and/or the values of the given locales (each replaces that locale's values). Keeps the status. */
  save(model: ContentModel, id: number, input: { slug?: unknown; values?: unknown }, options: { mediaExists?: (id: string) => boolean } = {}): EntryDetail {
    const row = this.mustFind(id);
    const type = this.typeOf(model, row.type);
    const slug = input.slug === undefined ? undefined : this.checkSlug(input.slug);
    const checked = input.values === undefined ? { values: {}, issues: [] } : this.checkValues(model, type, input.values, options);
    if (checked.issues.length > 0) throw this.invalid(checked.issues);
    try {
      this.inTransaction(() => {
        this.writeValues(id, checked.values);
        if (slug !== undefined) this.db.prepare('UPDATE _content_entries SET slug = ? WHERE id = ?').run(slug, id);
        this.db.prepare('UPDATE _content_entries SET version = version + 1, updatedAt = ? WHERE id = ?').run(this.stamp(), id);
        this.snapshot(id, 'save');
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.slugTaken(row.type);
      throw error;
    }
    return this.detailOf(this.mustFind(id));
  }

  remove(id: number): EntryDetail {
    const row = this.mustFind(id);
    const detail = this.detailOf(row);
    this.db.prepare('DELETE FROM _content_entries WHERE id = ?').run(id);
    return detail;
  }

  /** What stops an entry going live: required fields the default locale leaves empty. */
  private checkPublishable(model: ContentModel, row: EntryRow): void {
    const type = this.typeOf(model, row.type);
    const own = this.valuesOf([row.id]).get(row.id) ?? {};
    const missing = missingRequired(type, own[model.defaultLocale]);
    if (missing.length > 0) {
      const issues = missing.map((name) => ({ path: `values.${model.defaultLocale}.${name}`, message: 'Required to publish.' }));
      throw new ContentError(400, `Fill in ${missing.join(', ')} (${model.defaultLocale}) before publishing.`, issues);
    }
  }

  publish(model: ContentModel, id: number): EntryDetail {
    const row = this.mustFind(id);
    this.checkPublishable(model, row);
    const now = this.stamp();
    this.db.prepare("UPDATE _content_entries SET status = 'published', publishAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id);
    return this.detailOf(this.mustFind(id));
  }

  unpublish(id: number): EntryDetail {
    this.mustFind(id);
    this.db.prepare("UPDATE _content_entries SET status = 'draft', publishAt = NULL, updatedAt = ? WHERE id = ?").run(this.stamp(), id);
    return this.detailOf(this.mustFind(id));
  }

  /** The entry goes live at `at` (a future ISO date-time): on the next public read or the next 30 second tick after it. */
  schedule(model: ContentModel, id: number, at: unknown): EntryDetail {
    const row = this.mustFind(id);
    const time = typeof at === 'string' ? Date.parse(at) : Number.NaN;
    if (Number.isNaN(time)) throw new ContentError(400, 'publishAt: Send an ISO 8601 date and time.', [{ path: 'publishAt', message: 'Must be an ISO 8601 date and time.' }]);
    if (time <= this.now().getTime()) throw new ContentError(400, 'publishAt: Pick a time in the future (to publish now, use publish).', [{ path: 'publishAt', message: 'Must be in the future.' }]);
    this.checkPublishable(model, row);
    this.db.prepare("UPDATE _content_entries SET status = 'scheduled', publishAt = ?, updatedAt = ? WHERE id = ?").run(new Date(time).toISOString(), this.stamp(), id);
    return this.detailOf(this.mustFind(id));
  }

  /** Makes every scheduled entry whose time has come published. Returns how many. */
  publishDue(): number {
    const now = this.stamp();
    return Number(this.db.prepare("UPDATE _content_entries SET status = 'published', updatedAt = ? WHERE status = 'scheduled' AND publishAt <= ?").run(now, now).changes);
  }

  versions(id: number): VersionInfo[] {
    this.mustFind(id);
    return this.db
      .prepare('SELECT version, reason, slug, savedAt, data FROM _content_versions WHERE entryId = ? ORDER BY id DESC')
      .all(id)
      .map((raw) => ({
        version: Number(raw.version),
        reason: String(raw.reason) as VersionInfo['reason'],
        savedAt: String(raw.savedAt),
        slug: raw.slug === null ? null : String(raw.slug),
        locales: Object.keys(parseData(raw.data)),
      }));
  }

  /** The values of one kept version, for a preview. */
  versionValues(id: number, version: number): LocaleValues {
    this.mustFind(id);
    const raw = this.db.prepare('SELECT data FROM _content_versions WHERE entryId = ? AND version = ?').get(id, version);
    if (raw === undefined) throw new ContentError(404, `No version ${String(version)} of entry ${String(id)}.`);
    return parseData(raw.data) as LocaleValues;
  }

  /** Puts a kept version's slug and values back (as a new version). The status stays as it is. */
  revert(id: number, version: number): EntryDetail {
    const row = this.mustFind(id);
    const raw = this.db.prepare('SELECT slug, data FROM _content_versions WHERE entryId = ? AND version = ?').get(id, version);
    if (raw === undefined) throw new ContentError(404, `No version ${String(version)} of entry ${String(id)}.`);
    const saved = parseData(raw.data) as LocaleValues;
    try {
      this.inTransaction(() => {
        this.db.prepare('DELETE FROM _content_values WHERE entryId = ?').run(id);
        this.writeValues(id, saved);
        this.db.prepare('UPDATE _content_entries SET slug = ?, version = version + 1, updatedAt = ? WHERE id = ?').run(raw.slug === null ? null : String(raw.slug), this.stamp(), id);
        this.snapshot(id, 'revert');
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.slugTaken(row.type);
      throw error;
    }
    return this.detailOf(this.mustFind(id));
  }

  // ---- public reads

  /** Published entries of a type, in the order asked. Scheduled entries whose time has come are published first. */
  published(
    type: string,
    options: { sort: 'updatedAt' | 'publishAt'; desc: boolean; skip: number; limit: number },
  ): { rows: EntryRow[]; total: number } {
    this.publishDue();
    const total = this.count("SELECT COUNT(*) AS n FROM _content_entries WHERE type = ? AND status = 'published'", type);
    const column = options.sort === 'updatedAt' ? 'updatedAt' : 'publishAt';
    const direction = options.desc ? 'DESC' : 'ASC';
    const rows = this.db
      .prepare(`SELECT * FROM _content_entries WHERE type = ? AND status = 'published' ORDER BY ${column} ${direction}, id ${direction} LIMIT ? OFFSET ?`)
      .all(type, options.limit, options.skip)
      .map(toRow);
    return { rows, total };
  }

  /** One published entry by numeric id or by slug. */
  publishedOne(type: string, idOrSlug: string): EntryRow | undefined {
    this.publishDue();
    const raw = /^[1-9]\d{0,14}$/.test(idOrSlug)
      ? this.db.prepare("SELECT * FROM _content_entries WHERE type = ? AND status = 'published' AND id = ?").get(type, Number(idOrSlug))
      : this.db.prepare("SELECT * FROM _content_entries WHERE type = ? AND status = 'published' AND slug = ?").get(type, idOrSlug);
    return raw === undefined ? undefined : toRow(raw);
  }

  /** The one published entry of a singleton type. */
  publishedSingleton(type: string): EntryRow | undefined {
    this.publishDue();
    const raw = this.db.prepare("SELECT * FROM _content_entries WHERE type = ? AND status = 'published' ORDER BY id LIMIT 1").get(type);
    return raw === undefined ? undefined : toRow(raw);
  }
}
