import type { JsonSchema } from './schema.ts';

/**
 * JSON Schema to the source text of a Zod schema, for `export code`. The subset is the one the
 * importer produces and the loader reads: `type` (string, number, integer, boolean, null, array,
 * object, or a list of them), `enum`, `const`, `anyOf`/`oneOf` (a union; one `null` branch makes it
 * `.nullable()`), `allOf` (an intersection), string `format` (email, uuid, date-time, date, uri, url),
 * `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
 * (as numbers), `minItems`, `maxItems`, `items`, `properties`, `required` and `additionalProperties`.
 * Anything else becomes `z.unknown()`.
 */
export function zodSource(schema: unknown, options: { text?: boolean; level?: number } = {}): string {
  return build(schema, options.text === true, options.level ?? 0);
}

/** A single-quoted TypeScript string literal. */
export function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
}

const isObject = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string): string => (IDENTIFIER.test(name) ? name : quote(name));
const literal = (value: unknown): string => (typeof value === 'string' ? quote(value) : JSON.stringify(value));

function build(raw: unknown, text: boolean, level: number): string {
  if (!isObject(raw)) return 'z.unknown()';
  const schema = raw;

  if ('const' in schema) return `z.literal(${literal(schema.const)})`;
  if (Array.isArray(schema.enum)) {
    const values = schema.enum as unknown[];
    return values.every((v) => typeof v === 'string' && !(v === ''))
      ? `z.enum([${values.map(literal).join(', ')}])`
      : `z.union([${values.map((v) => `z.literal(${literal(v)})`).join(', ')}])`;
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const nonNull = branches.filter((b) => !(isObject(b) && b.type === 'null'));
    const nullable = nonNull.length !== branches.length;
    const inner = nonNull.length === 1 ? build(nonNull[0], text, level) : `z.union([${nonNull.map((b) => build(b, text, level)).join(', ')}])`;
    return nullable ? `${inner}.nullable()` : inner;
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const parts = schema.allOf.map((part) => build(part, text, level));
    return parts.slice(1).reduce((left, right) => `z.intersection(${left}, ${right})`, parts[0] ?? 'z.unknown()');
  }

  const types = Array.isArray(schema.type) ? (schema.type as string[]) : typeof schema.type === 'string' ? [schema.type] : [];
  const nonNull = types.filter((type) => type !== 'null');
  if (types.length > 1) {
    const inner = nonNull.length === 1 ? build({ ...schema, type: nonNull[0] }, text, level) : `z.union([${nonNull.map((type) => build({ ...schema, type }, text, level)).join(', ')}])`;
    return nonNull.length === types.length ? inner : `${inner}.nullable()`;
  }
  switch (types[0]) {
    case 'null':
      return 'z.null()';
    case 'boolean':
      return text ? 'z.stringbool()' : 'z.boolean()';
    case 'string':
      return stringSource(schema);
    case 'number':
    case 'integer':
      return numberSource(schema, types[0] === 'integer', text);
    case 'array': {
      let out = `z.array(${build(schema.items, text, level)})`;
      if (typeof schema.minItems === 'number') out += `.min(${schema.minItems})`;
      if (typeof schema.maxItems === 'number') out += `.max(${schema.maxItems})`;
      return out;
    }
    case 'object':
      return objectSource(schema, text, level);
    default:
      // No `type` but `properties` is still an object.
      return isObject(schema.properties) ? objectSource(schema, text, level) : 'z.unknown()';
  }
}

function stringSource(schema: JsonSchema): string {
  const base: Record<string, string> = {
    email: 'z.email()',
    uuid: 'z.uuid()',
    'date-time': 'z.iso.datetime()',
    date: 'z.iso.date()',
    uri: 'z.url()',
    url: 'z.url()',
  };
  let out = (typeof schema.format === 'string' ? base[schema.format] : undefined) ?? 'z.string()';
  if (typeof schema.minLength === 'number') out += `.min(${schema.minLength})`;
  if (typeof schema.maxLength === 'number') out += `.max(${schema.maxLength})`;
  if (typeof schema.pattern === 'string') out += `.regex(new RegExp(${literal(schema.pattern)}))`;
  return out;
}

function numberSource(schema: JsonSchema, integer: boolean, text: boolean): string {
  let out = text ? 'z.coerce.number()' : 'z.number()';
  if (integer) out += '.int()';
  if (typeof schema.minimum === 'number') out += `.min(${schema.minimum})`;
  if (typeof schema.maximum === 'number') out += `.max(${schema.maximum})`;
  if (typeof schema.exclusiveMinimum === 'number') out += `.gt(${schema.exclusiveMinimum})`;
  if (typeof schema.exclusiveMaximum === 'number') out += `.lt(${schema.exclusiveMaximum})`;
  return out;
}

function objectSource(schema: JsonSchema, text: boolean, level: number): string {
  const pad = '  '.repeat(level + 1);
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const extra = schema.additionalProperties;
  const names = Object.keys(properties);
  // A map with no named properties: `{ [key: string]: T }`.
  if (names.length === 0 && isObject(extra)) return `z.record(z.string(), ${build(extra, text, level)})`;
  if (names.length === 0 && extra === undefined) return 'z.record(z.string(), z.unknown())';
  const lines = names.map((name) => {
    const value = build(properties[name], text, level + 1);
    return `${pad}${key(name)}: ${required.has(name) ? value : `${value}.optional()`},`;
  });
  const body = lines.length === 0 ? '{}' : `{\n${lines.join('\n')}\n${'  '.repeat(level)}}`;
  if (extra === false) return `z.strictObject(${body})`;
  if (isObject(extra)) return `z.object(${body}).catchall(${build(extra, text, level)})`;
  return `z.looseObject(${body})`;
}
