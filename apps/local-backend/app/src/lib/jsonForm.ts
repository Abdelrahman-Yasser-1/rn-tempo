import type { FieldDef, JsonSchema } from '../api/types';

import { isPlaceholderText } from './placeholders';

export type Path = (string | number)[];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : []);

export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'object' | 'json';

export interface FormField {
  path: Path;
  name: string;
  kind: FieldKind;
  required: boolean;
  description?: string;
  enumValues?: string[];
  children?: FormField[];
}

/** The text of a JSON value, or why it is not JSON. An empty text is "no value". */
export function readText(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (text.trim() === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'It is not valid JSON.' };
  }
}

export const writeText = (value: unknown): string => (value === undefined ? '' : JSON.stringify(value, null, 2));

/** The first usable type of a schema: `anyOf`/`oneOf` without `null`, `type: [..., "null"]`, and merged `allOf`. */
function effective(schema: JsonSchema): JsonSchema {
  const branches = [...listOf(schema.anyOf), ...listOf(schema.oneOf)].filter(isObject);
  const real = branches.find((branch) => branch.type !== 'null');
  const base = real === undefined ? schema : { ...schema, ...effective(real) };
  if (Array.isArray(base.allOf)) {
    const merged: JsonSchema = { ...base };
    for (const part of listOf(base.allOf).filter(isObject)) {
      const inner = effective(part);
      merged.properties = { ...(isObject(merged.properties) ? merged.properties : {}), ...(isObject(inner.properties) ? inner.properties : {}) };
      merged.required = [...listOf(merged.required), ...listOf(inner.required)];
      merged.type ??= inner.type;
    }
    return merged;
  }
  if (Array.isArray(base.type)) return { ...base, type: base.type.find((entry) => entry !== 'null') };
  return base;
}

function kindOf(schema: JsonSchema): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.every((item) => typeof item === 'string')) return 'enum';
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'integer':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'object':
      return isObject(schema.properties) ? 'object' : 'json';
    default:
      return isObject(schema.properties) ? 'object' : 'json';
  }
}

const MAX_DEPTH = 4;

/** The fields the form shows for an object schema: its properties, then any other keys the value already has (as JSON). */
export function fieldsFor(schema: JsonSchema | undefined, value: unknown, path: Path = [], depth = 0): FormField[] {
  const own = schema === undefined ? undefined : effective(schema);
  const properties = own !== undefined && isObject(own.properties) ? own.properties : {};
  const required = new Set(own === undefined ? [] : listOf(own.required).filter((name): name is string => typeof name === 'string'));
  const fields: FormField[] = Object.entries(properties).map(([name, child]) => {
    const sub = isObject(child) ? effective(child) : {};
    const kind = depth >= MAX_DEPTH ? 'json' : kindOf(sub);
    return {
      path: [...path, name],
      name,
      kind,
      required: required.has(name),
      ...(typeof sub.description === 'string' ? { description: sub.description } : {}),
      ...(kind === 'enum' ? { enumValues: (sub.enum as string[]).slice() } : {}),
      ...(kind === 'object' ? { children: fieldsFor(sub, isObject(value) ? value[name] : undefined, [...path, name], depth + 1) } : {}),
    };
  });
  if (isObject(value)) {
    for (const name of Object.keys(value)) if (!(name in properties)) fields.push({ path: [...path, name], name, kind: 'json', required: false });
  }
  return fields;
}

/** The value at a path, or `undefined`. */
export function getAt(value: unknown, path: Path): unknown {
  let current = value;
  for (const key of path) {
    if (isObject(current) && Object.hasOwn(current, key)) current = current[String(key)];
    else if (Array.isArray(current) && typeof key === 'number') current = current[key];
    else return undefined;
  }
  return current;
}

/** A copy of `value` with `next` at `path` (`undefined` removes the key). Missing objects on the way are made. */
export function setAt(value: unknown, path: Path, next: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return next;
  const base: Record<string, unknown> = isObject(value) ? { ...value } : {};
  const child = rest.length === 0 ? next : setAt(getAt(base, [key]), rest, next);
  if (child === undefined) return Object.fromEntries(Object.entries(base).filter(([name]) => name !== String(key)));
  Object.defineProperty(base, String(key), { value: child, enumerable: true, writable: true, configurable: true });
  return base;
}

export type Scalar = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * What a typed value means for a field. An empty box removes the key. A number box takes a number or a `{{placeholder}}`
 * (kept as text: the engine fills it with a number).
 */
export function parseScalar(kind: FieldKind, text: string): Scalar {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: undefined };
  if (isPlaceholderText(trimmed) && kind !== 'json') return { ok: true, value: trimmed };
  switch (kind) {
    case 'number':
    case 'integer': {
      const number = Number(trimmed);
      if (!Number.isFinite(number)) return { ok: false, message: 'Enter a number or a {{placeholder}}.' };
      if (kind === 'integer' && !Number.isInteger(number)) return { ok: false, message: 'Enter a whole number or a {{placeholder}}.' };
      return { ok: true, value: number };
    }
    case 'json': {
      const read = readText(trimmed);
      return read.ok ? read : { ok: false, message: 'That is not valid JSON.' };
    }
    default:
      return { ok: true, value: text };
  }
}

/** A JSON Schema made from collection fields, so a record can be edited with the same form. */
export function schemaFromFields(fields: FieldDef[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const field of fields) {
    switch (field.type) {
      case 'number':
      case 'relation':
        properties[field.name] = { type: 'number' };
        break;
      case 'boolean':
        properties[field.name] = { type: 'boolean' };
        break;
      case 'enum':
        properties[field.name] = { type: 'string', enum: field.enumValues ?? [] };
        break;
      case 'json':
        properties[field.name] = {};
        break;
      default:
        properties[field.name] = { type: 'string' };
    }
    if (field.required) required.push(field.name);
  }
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

/** A schema that describes a value, so the form can edit a body that has none. */
export function inferSchema(value: unknown, depth = 0): JsonSchema {
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (isObject(value) && depth < MAX_DEPTH) return { type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inferSchema(child, depth + 1)])) };
  return {};
}
