import type { Collection, Field } from './schema.ts';

/** One invalid field of a request, with a path like `body.price`. */
export interface FieldIssue {
  path: string;
  message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value fits a field's type. Relation existence is checked separately. Returns the problem, or undefined. */
export function checkShape(field: Field, value: unknown): string | undefined {
  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? undefined : 'Must be a string.';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : 'Must be a number.';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Must be true or false.';
    case 'date':
      return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? undefined : 'Must be an ISO 8601 date, for example 2026-11-17 or 2026-11-17T10:00:00Z.';
    case 'enum':
      return typeof value === 'string' && (field.enumValues ?? []).includes(value) ? undefined : `Must be one of: ${(field.enumValues ?? []).join(', ')}.`;
    case 'json':
      return jsonSafe(value) ? undefined : 'Must be valid JSON.';
    case 'relation':
      return typeof value === 'number' && Number.isInteger(value) && value > 0 ? undefined : 'Must be the id of a record.';
    case 'media':
      return typeof value === 'string' && value.length > 0 && value.length <= 128 ? undefined : 'Must be a media id.';
  }
}

function jsonSafe(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

/** The value as stored in SQLite: booleans become 0/1 and json becomes text. */
export function encodeValue(field: Field, value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'boolean':
      return value === true ? 1 : 0;
    case 'json':
      return JSON.stringify(value);
    case 'number':
    case 'relation':
      return Number(value);
    default:
      return String(value);
  }
}

/** The value as the API shows it. */
export function decodeValue(field: Field, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  switch (field.type) {
    case 'boolean':
      return raw === 1 || raw === 1n;
    case 'json':
      try {
        return JSON.parse(String(raw));
      } catch {
        return null;
      }
    default:
      return raw;
  }
}

export type WriteMode = 'create' | 'replace' | 'patch';

export interface ValidateOptions {
  mode: WriteMode;
  /** `reject` reports fields the collection does not define; `strip` drops them. */
  unknownFields: 'reject' | 'strip';
  /** Does a record with this id exist in that collection? Used by relation fields. */
  exists: (collection: string, id: number) => boolean;
  /** Seed rows may carry their own id. */
  allowId?: boolean;
  /** `body` (a request) or `seed[3]`. */
  part?: string;
}

export interface Validated {
  /** Field name to value to write (decoded form, not yet encoded). */
  values: Record<string, unknown>;
  id?: number;
  issues: FieldIssue[];
}

/** Validates a request body against a collection's fields. Defaults fill the gaps of a create or replace. */
export function validateRecord(collection: Collection, body: unknown, options: ValidateOptions): Validated {
  const part = options.part ?? 'body';
  const issues: FieldIssue[] = [];
  if (!isPlainObject(body)) return { values: {}, issues: [{ path: part, message: 'Send a JSON object.' }] };
  const fields = new Map(collection.fields.map((field) => [field.name, field]));
  const values: Record<string, unknown> = {};
  let id: number | undefined;

  for (const [key, value] of Object.entries(body)) {
    if (key === 'id') {
      if (options.allowId === true) {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) id = value;
        else issues.push({ path: `${part}.id`, message: 'Must be a positive whole number.' });
      }
      continue;
    }
    const field = fields.get(key);
    if (field === undefined) {
      if (options.unknownFields === 'reject') issues.push({ path: `${part}.${key}`, message: `Unknown field "${key}".` });
      continue;
    }
    if (value === null) {
      if (field.required) issues.push({ path: `${part}.${key}`, message: 'Required.' });
      else values[key] = null;
      continue;
    }
    const problem = checkShape(field, value);
    if (problem !== undefined) issues.push({ path: `${part}.${key}`, message: problem });
    else if (field.type === 'relation' && !options.exists(field.relationTo ?? '', value as number)) {
      issues.push({ path: `${part}.${key}`, message: `No ${field.relationTo ?? 'record'} with id ${String(value)}.` });
    } else values[key] = value;
  }

  if (options.mode !== 'patch') {
    for (const field of collection.fields) {
      if (Object.hasOwn(body, field.name) && body[field.name] !== undefined) continue;
      if (field.default !== undefined) values[field.name] = structuredClone(field.default);
      else if (field.required) issues.push({ path: `${part}.${field.name}`, message: 'Required.' });
      else if (options.mode === 'replace') values[field.name] = null;
    }
  }
  return { values, ...(id === undefined ? {} : { id }), issues };
}
