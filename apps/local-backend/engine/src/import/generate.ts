import { createHash } from 'node:crypto';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A small seeded random number generator (mulberry32). The same seed text always gives the same numbers. */
export class Rng {
  private state: number;

  constructor(seedText: string) {
    this.state = createHash('sha256').update(seedText).digest().readUInt32LE(0);
  }

  /** A number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer from `min` to `max`, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  hex(length: number): string {
    let out = '';
    while (out.length < length) out += this.int(0, 15).toString(16);
    return out;
  }
}

const WORDS = ['alpha', 'bravo', 'cedar', 'delta', 'ember', 'fjord', 'glade', 'harbor', 'iris', 'juniper', 'kite', 'lumen', 'maple', 'nectar', 'orbit', 'pine'];
const FIRST = ['Ada', 'Ben', 'Chloe', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];
const LAST = ['Rivera', 'Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Tanaka', 'Silva', 'Novak'];
const MAX_NODES = 5_000;
const MAX_DEPTH = 7;

const BASE_DATE = Date.UTC(2024, 0, 1);
const DAY = 86_400_000;

function formatted(format: string, rng: Rng): string | undefined {
  switch (format) {
    case 'email':
      return `${rng.pick(WORDS)}.${rng.hex(4)}@example.com`;
    case 'uuid':
      return `${rng.hex(8)}-${rng.hex(4)}-4${rng.hex(3)}-a${rng.hex(3)}-${rng.hex(12)}`;
    case 'date-time':
      return new Date(BASE_DATE + rng.int(0, 700) * DAY + rng.int(0, 86_399) * 1000).toISOString();
    case 'date':
      return new Date(BASE_DATE + rng.int(0, 700) * DAY).toISOString().slice(0, 10);
    case 'time':
      return `${String(rng.int(0, 23)).padStart(2, '0')}:${String(rng.int(0, 59)).padStart(2, '0')}:00Z`;
    case 'uri':
    case 'url':
    case 'iri':
      return `https://example.com/${rng.pick(WORDS)}/${rng.hex(6)}`;
    case 'hostname':
      return `${rng.pick(WORDS)}.example.com`;
    case 'ipv4':
      return `192.0.2.${rng.int(1, 254)}`;
    case 'ipv6':
      return `2001:db8::${rng.hex(4)}`;
    case 'byte':
      return Buffer.from(rng.hex(8)).toString('base64');
    case 'binary':
      return rng.hex(8);
    case 'password':
      return rng.hex(12);
    default:
      return undefined;
  }
}

/** A string from the property name when the schema says nothing more. */
function byName(name: string | undefined, rng: Rng): string | undefined {
  if (name === undefined) return undefined;
  const key = name.toLowerCase();
  if (/e-?mail/.test(key)) return formatted('email', rng);
  if (/(url|uri|link|image|avatar|photo|thumbnail)$/.test(key)) return formatted('uri', rng);
  if (/first_?name/.test(key)) return rng.pick(FIRST);
  if (/last_?name|surname/.test(key)) return rng.pick(LAST);
  if (/(^|_)name$|^name|fullname|username/.test(key)) return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  if (/phone/.test(key)) return `+1555${String(rng.int(1_000_000, 9_999_999))}`;
  if (/(created|updated|deleted).*(at|on)$|timestamp/.test(key)) return formatted('date-time', rng);
  return undefined;
}

/** The longest string, and the most items, an import generates, whatever the schema asks for. */
export const MAX_GENERATED_LENGTH = 1000;
export const MAX_GENERATED_ITEMS = 3;

function stringValue(schema: Json, rng: Rng, name: string | undefined, state: Walk): string {
  const format = typeof schema.format === 'string' ? schema.format : undefined;
  let value = (format === undefined ? undefined : formatted(format, rng)) ?? byName(name, rng) ?? `${rng.pick(WORDS)} ${rng.pick(WORDS)}`;
  const asked = (key: string, fallback: number): number => {
    const raw = schema[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return fallback;
    if (raw > MAX_GENERATED_LENGTH) state.clamped = true;
    return Math.min(raw, MAX_GENERATED_LENGTH);
  };
  const min = asked('minLength', 0);
  const max = asked('maxLength', MAX_GENERATED_LENGTH);
  while (value.length < min) value += ` ${rng.pick(WORDS)}`;
  if (value.length > max) value = value.slice(0, max);
  return value;
}

function numberValue(schema: Json, rng: Rng, integer: boolean): number {
  const lo = typeof schema.minimum === 'number' ? schema.minimum : typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + (integer ? 1 : 0.01) : undefined;
  const hi = typeof schema.maximum === 'number' ? schema.maximum : typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum - (integer ? 1 : 0.01) : undefined;
  const min = lo ?? (hi === undefined ? 1 : hi - 100);
  const max = Math.max(min, hi ?? (lo === undefined ? 1000 : lo + 100));
  let value = integer ? rng.int(Math.ceil(min), Math.max(Math.ceil(min), Math.floor(max))) : Math.round((min + rng.next() * (max - min)) * 100) / 100;
  const step = typeof schema.multipleOf === 'number' && schema.multipleOf > 0 ? schema.multipleOf : undefined;
  if (step !== undefined) value = Math.round(value / step) * step;
  return value;
}

interface Walk {
  rng: Rng;
  nodes: number;
  /** A schema asked for more than the limits allow. */
  clamped: boolean;
}

function typeOf(schema: Json): string | undefined {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) return schema.type.find((entry): entry is string => typeof entry === 'string' && entry !== 'null');
  if (isObject(schema.properties)) return 'object';
  if (schema.items !== undefined) return 'array';
  return undefined;
}

function walk(schema: unknown, state: Walk, name: string | undefined, depth: number): unknown {
  state.nodes += 1;
  if (!isObject(schema)) return {};
  if ('const' in schema) return schema.const;
  const declared = Array.isArray(schema.examples) && schema.examples.length > 0 ? schema.examples[0] : schema.example;
  if (declared !== undefined) return declared;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return state.rng.pick(schema.enum);
  if (state.nodes > MAX_NODES || depth > MAX_DEPTH) return typeOf(schema) === 'array' ? [] : typeOf(schema) === 'object' ? {} : null;
  for (const key of ['oneOf', 'anyOf'] as const) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) {
      const usable = options.filter((option) => !(isObject(option) && option.type === 'null'));
      return walk((usable[0] ?? options[0]) as unknown, state, name, depth + 1);
    }
  }
  if (Array.isArray(schema.allOf)) {
    const merged: Json = { ...schema };
    delete merged.allOf;
    for (const part of schema.allOf) {
      if (!isObject(part)) continue;
      for (const [key, value] of Object.entries(part)) {
        if (key === 'properties' && isObject(value)) merged.properties = { ...(isObject(merged.properties) ? merged.properties : {}), ...value };
        else if (key === 'required' && Array.isArray(value)) merged.required = [...new Set([...(Array.isArray(merged.required) ? merged.required : []), ...value])];
        else if (merged[key] === undefined) merged[key] = value;
      }
    }
    return walk(merged, state, name, depth + 1);
  }
  switch (typeOf(schema)) {
    case 'string':
      return stringValue(schema, state.rng, name, state);
    case 'integer':
      return numberValue(schema, state.rng, true);
    case 'number':
      return numberValue(schema, state.rng, false);
    case 'boolean':
      return state.rng.next() < 0.5;
    case 'null':
      return null;
    case 'array': {
      // The count never follows the schema past the cap: `minItems: 1e9` still gives up to 3 items.
      const asked = typeof schema.minItems === 'number' ? schema.minItems : 1;
      if (asked > MAX_GENERATED_ITEMS || (typeof schema.maxItems === 'number' && schema.maxItems > MAX_GENERATED_ITEMS && asked > MAX_GENERATED_ITEMS)) state.clamped = true;
      const floor = schema.minItems === 0 ? 0 : 1;
      const ceiling = typeof schema.maxItems === 'number' && schema.maxItems >= 0 ? Math.min(schema.maxItems, MAX_GENERATED_ITEMS) : MAX_GENERATED_ITEMS;
      const count = state.rng.int(Math.min(floor, ceiling), ceiling);
      return Array.from({ length: count }, () => walk(schema.items, state, name, depth + 1));
    }
    case 'object': {
      const out: Json = {};
      const properties = isObject(schema.properties) ? Object.entries(schema.properties).slice(0, 40) : [];
      for (const [key, child] of properties) out[key] = walk(child, state, key, depth + 1);
      return out;
    }
    default:
      return {};
  }
}

/**
 * Deterministic data for a JSON Schema: the same schema and `seed` always give the same value. It honours `example`,
 * `default`, `enum`, `const`, formats (email, uuid, date-time, uri...), `min`/`max` limits and makes arrays of 1 to 3
 * items. It never uses a clock or `Math.random`, and stops growing after a fixed number of nodes.
 */
export function generateFromSchema(schema: unknown, seed: string, notes?: string[]): unknown {
  const state: Walk = { rng: new Rng(seed), nodes: 0, clamped: false };
  const value = walk(schema, state, undefined, 0);
  if (state.clamped) notes?.push(`Generated data for ${seed.split('|')[0] ?? seed} was cut to at most ${String(MAX_GENERATED_ITEMS)} items and ${String(MAX_GENERATED_LENGTH)} characters, because the file asked for more.`);
  return value;
}
