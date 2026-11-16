import type { Faker } from '@faker-js/faker';
import { z } from 'zod';

import { formatCandidates } from './formats.ts';
import { hintCandidates } from './heuristics.ts';
import { REFERENCE_DATE } from './rng.ts';
import { sampleRegex, UnsupportedRegexError } from './regex.ts';

/*
 * Introspection: we read `schema._zod.def` (documented at zod.dev/packages/core) rather than
 * converting to JSON Schema. `toJSONSchema` throws for dates, transforms and lazy schemas, drops
 * custom checks, and loses the difference between input and output, while `def` exposes every
 * kind we need (`def.type`) and each check (`def.checks[i]._zod.def.check`).
 */

type Schema = z.core.$ZodType;
interface Def {
  type: string;
  [key: string]: unknown;
}
interface CheckDef {
  check: string;
  [key: string]: unknown;
}

const MAX_DEPTH = 6;
const MAX_ROUNDS = 8;

/** The schema cannot be generated, or no value that it accepts was found. */
export class GenerateError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(path === '' ? message : `${message} (at ${path})`);
    this.name = 'GenerateError';
    this.path = path;
  }
}

/** Recursion went past `MAX_DEPTH`; enclosing optional, nullable, array and union nodes stop early. */
export class TooDeepError extends Error {}

interface Ctx {
  faker: Faker;
  depth: number;
  /** Field name used for the realistic-value heuristics. */
  hint: string | undefined;
  path: string;
}

const defOf = (schema: Schema): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;

function checksOf(schema: Schema): CheckDef[] {
  const def = defOf(schema);
  const own = typeof def.check === 'string' ? [def as unknown as CheckDef] : [];
  const list = (def.checks as Schema[] | undefined) ?? [];
  return [...own, ...list.map((c) => (c as unknown as { _zod: { def: CheckDef } })._zod.def)];
}

const accepts = (schema: Schema, value: unknown): boolean => z.safeParse(schema as z.ZodType, value).success;

/** `.meta({ example })`, `.meta({ examples: [...] })`, or `.describe('... example: foo')`. */
function exampleFor(schema: Schema): unknown {
  const meta = z.globalRegistry.get(schema as z.ZodType) as
    | { example?: unknown; examples?: unknown; description?: string }
    | undefined;
  if (meta === undefined) return undefined;
  if (meta.example !== undefined) return meta.example;
  if (Array.isArray(meta.examples) && meta.examples.length > 0) return meta.examples[0];
  const match = /\bexample:\s*(.+)$/i.exec(meta.description ?? '');
  if (match?.[1] === undefined) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return match[1].trim();
  }
}

/** Generates a value that `schema` accepts. Throws `GenerateError` for unsupported kinds. */
export function walk(schema: Schema, ctx: Ctx): unknown {
  const example = exampleFor(schema);
  if (example !== undefined && accepts(schema, example)) return structuredClone(example);

  const def = defOf(schema);
  const { faker } = ctx;
  const inner = (next: unknown, patch: Partial<Ctx> = {}): unknown => walk(next as Schema, { ...ctx, ...patch });

  switch (def.type) {
    case 'object':
      return genObject(def, ctx);
    case 'array':
      return genArray(schema, def, ctx);
    case 'string':
      return genString(schema, ctx);
    case 'number':
      return genNumber(schema, ctx);
    case 'boolean':
      return faker.datatype.boolean();
    case 'bigint':
      return BigInt(faker.number.int({ min: 0, max: 10_000 }));
    case 'date':
      return genDate(schema, ctx);
    case 'enum':
      return faker.helpers.arrayElement(Object.values(def.entries as Record<string, unknown>));
    case 'literal':
      return faker.helpers.arrayElement(def.values as unknown[]);
    case 'null':
      return null;
    case 'undefined':
    case 'void':
      return undefined;
    case 'any':
    case 'unknown':
      return faker.lorem.word();
    case 'optional':
      try {
        return inner(def.innerType);
      } catch (error) {
        if (error instanceof TooDeepError) return undefined;
        throw error;
      }
    case 'nullable':
      try {
        return inner(def.innerType);
      } catch (error) {
        if (error instanceof TooDeepError) return null;
        throw error;
      }
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'readonly':
    case 'catch':
      return inner(def.innerType);
    case 'pipe':
      // `z.preprocess` is a pipe whose input is a transform; every other pipe starts with a real schema.
      return inner(defOf(def.in as Schema).type === 'transform' ? def.out : def.in);
    case 'lazy':
      return inner((def.getter as () => unknown)(), { depth: ctx.depth + 1 });
    case 'union':
      return genUnion(def, ctx);
    case 'intersection': {
      const left = inner(def.left);
      const right = inner(def.right);
      return isPlainObject(left) && isPlainObject(right) ? { ...left, ...right } : left;
    }
    case 'record':
      return genRecord(def, ctx);
    case 'tuple':
      return genTuple(def, ctx);
    case 'map':
      return new Map(
        Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, (): [unknown, unknown] => [
          inner(def.keyType, { hint: undefined }),
          inner(def.valueType, { hint: undefined }),
        ]),
      );
    case 'set':
      return new Set(Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => inner(def.valueType)));
    default:
      throw new GenerateError(`Cannot generate a value for a "${def.type}" schema`, ctx.path);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function enter(ctx: Ctx): Ctx {
  if (ctx.depth + 1 > MAX_DEPTH) throw new TooDeepError();
  return { ...ctx, depth: ctx.depth + 1 };
}

function genObject(def: Def, ctx: Ctx): Record<string, unknown> {
  const next = enter(ctx);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(def.shape as Record<string, Schema>)) {
    const value = walk(child, { ...next, hint: key, path: `${ctx.path}.${key}` });
    // Optional fields that stopped at the depth cap come back undefined and are left out.
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function lengthRange(checks: CheckDef[], fallbackMin: number, fallbackMax: number): { min: number; max: number } {
  let min = fallbackMin;
  let max = fallbackMax;
  let exact: number | undefined;
  for (const check of checks) {
    if (check.check === 'min_length') min = check.minimum as number;
    if (check.check === 'max_length') max = check.maximum as number;
    if (check.check === 'length_equals') exact = check.length as number;
  }
  if (exact !== undefined) return { min: exact, max: exact };
  return { min, max: Math.max(min, max) };
}

function genArray(schema: Schema, def: Def, ctx: Ctx): unknown[] {
  const { faker } = ctx;
  const { min: required, max } = lengthRange(checksOf(schema), 0, 5);
  // Lists without a minimum still get one item, so the data looks populated.
  const min = required === 0 ? Math.min(1, max) : required;
  // Deeper levels shrink so nested lists stay small.
  const cap = ctx.depth >= 3 ? 1 : ctx.depth >= 2 ? 2 : Infinity;
  const count = faker.number.int({ min, max: Math.max(min, Math.min(max, cap)) });
  try {
    return Array.from({ length: count }, (_, i) =>
      walk(def.element as Schema, { ...ctx, path: `${ctx.path}[${i}]` }),
    );
  } catch (error) {
    if (error instanceof TooDeepError && required === 0) return [];
    throw error;
  }
}

function genUnion(def: Def, ctx: Ctx): unknown {
  const options = ctx.faker.helpers.shuffle([...(def.options as Schema[])]);
  let tooDeep = false;
  for (const option of options) {
    try {
      return walk(option, ctx);
    } catch (error) {
      if (!(error instanceof TooDeepError)) throw error;
      tooDeep = true;
    }
  }
  if (tooDeep) throw new TooDeepError();
  throw new GenerateError('Union has no options', ctx.path);
}

function genRecord(def: Def, ctx: Ctx): Record<string, unknown> {
  const { faker } = ctx;
  const keyType = def.keyType as Schema;
  const keyDef = defOf(keyType);
  // A record keyed by an enum or literal must contain every key.
  const fixedKeys =
    keyDef.type === 'enum'
      ? Object.values(keyDef.entries as Record<string, string>)
      : keyDef.type === 'literal'
        ? (keyDef.values as string[])
        : undefined;
  const keys =
    fixedKeys ??
    Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => walk(keyType, { ...ctx, hint: undefined }) as string);
  const out: Record<string, unknown> = {};
  try {
    for (const key of keys) out[key] = walk(def.valueType as Schema, { ...ctx, hint: key, path: `${ctx.path}.${key}` });
  } catch (error) {
    if (error instanceof TooDeepError && fixedKeys === undefined) return {};
    throw error;
  }
  return out;
}

function genTuple(def: Def, ctx: Ctx): unknown[] {
  const items = (def.items as Schema[]).map((item, i) => walk(item, { ...ctx, path: `${ctx.path}[${i}]` }));
  const rest = def.rest as Schema | null | undefined;
  if (rest !== null && rest !== undefined) {
    const extra = ctx.faker.number.int({ min: 0, max: 2 });
    for (let i = 0; i < extra; i++) items.push(walk(rest, ctx));
  }
  return items;
}

// ---------------------------------------------------------------- strings

interface StringSpec {
  min: number;
  max: number;
  format: string | undefined;
  patterns: RegExp[];
  prefix: string;
  suffix: string;
  includes: string[];
  lower: boolean;
  upper: boolean;
}

/** Formats that are really constraints on top of a plain string. */
const CONSTRAINT_FORMATS = new Set(['regex', 'starts_with', 'ends_with', 'includes', 'lowercase', 'uppercase']);

function stringSpec(schema: Schema): StringSpec {
  const checks = checksOf(schema);
  const { min, max } = lengthRange(checks, 1, 40);
  const spec: StringSpec = { min, max, format: undefined, patterns: [], prefix: '', suffix: '', includes: [], lower: false, upper: false };
  for (const check of checks) {
    if (check.check !== 'string_format') continue;
    const format = check.format as string;
    if (check.pattern instanceof RegExp && format !== 'starts_with' && format !== 'ends_with' && format !== 'includes') {
      spec.patterns.push(check.pattern);
    }
    if (!CONSTRAINT_FORMATS.has(format)) spec.format ??= format;
    else if (format === 'starts_with') spec.prefix = check.prefix as string;
    else if (format === 'ends_with') spec.suffix = check.suffix as string;
    else if (format === 'includes') spec.includes.push(check.includes as string);
    else if (format === 'lowercase') spec.lower = true;
    else if (format === 'uppercase') spec.upper = true;
  }
  return spec;
}

/** Plain text that respects length, prefix, suffix, includes and case constraints. */
function plainString(spec: StringSpec, faker: Faker): string {
  const fixed = spec.prefix.length + spec.suffix.length + spec.includes.join('').length;
  let core = faker.lorem.words({ min: 1, max: 3 });
  while (core.length + fixed < spec.min) core += ` ${faker.lorem.word()}`;
  const room = spec.max - fixed;
  if (core.length > room) core = core.slice(0, Math.max(0, room)).trimEnd();
  let text = spec.prefix + core + spec.includes.join('') + spec.suffix;
  while (text.length < spec.min) text += 'x';
  if (spec.lower) text = text.toLowerCase();
  if (spec.upper) text = text.toUpperCase();
  return text;
}

function genString(schema: Schema, ctx: Ctx): string {
  const { faker } = ctx;
  const spec = stringSpec(schema);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const candidates: unknown[] = [...hintCandidates(ctx.hint, 'string', faker)];
    if (spec.format !== undefined) candidates.push(...formatCandidates(spec.format, faker));
    for (const pattern of spec.patterns) {
      try {
        candidates.push(sampleRegex(pattern.source, faker));
      } catch (error) {
        if (!(error instanceof UnsupportedRegexError)) throw error;
      }
    }
    candidates.push(plainString(spec, faker));
    const found = candidates.find((value) => accepts(schema, value));
    if (found !== undefined) return found as string;
  }
  throw new GenerateError(
    `Could not generate a string that matches the schema${spec.format === undefined ? '' : ` (format ${spec.format})`}`,
    ctx.path,
  );
}

// ---------------------------------------------------------------- numbers

const INT_RANGES: Record<string, [number, number]> = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-(2 ** 31), 2 ** 31 - 1],
  uint32: [0, 2 ** 32 - 1],
};

function genNumber(schema: Schema, ctx: Ctx): number {
  const { faker } = ctx;
  let lo: number | undefined;
  let hi: number | undefined;
  let loExclusive = false;
  let hiExclusive = false;
  let integer = false;
  let step: number | undefined;
  let formatRange: [number, number] | undefined;
  for (const check of checksOf(schema)) {
    if (check.check === 'greater_than') [lo, loExclusive] = [check.value as number, !check.inclusive];
    else if (check.check === 'less_than') [hi, hiExclusive] = [check.value as number, !check.inclusive];
    else if (check.check === 'multiple_of') step = check.value as number;
    else if (check.check === 'number_format') {
      const format = check.format as string;
      integer = format in INT_RANGES;
      formatRange = INT_RANGES[format];
    }
  }
  // An unbounded side is placed 1000 away from the bounded one (or from zero).
  const low = lo ?? (hi === undefined ? 0 : Math.min(0, hi - 1000));
  const high = hi ?? low + 1000;
  const cap = (n: number): number => (formatRange === undefined ? n : Math.min(Math.max(n, formatRange[0]), formatRange[1]));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const candidates: number[] = hintCandidates(ctx.hint, 'number', faker) as number[];
    if (step !== undefined) {
      const first = Math.ceil(low / step) + (loExclusive && Number.isInteger(low / step) ? 1 : 0);
      const last = Math.floor(high / step) - (hiExclusive && Number.isInteger(high / step) ? 1 : 0);
      if (first <= last) candidates.push(Number((faker.number.int({ min: first, max: last }) * step).toFixed(10)));
    } else if (integer) {
      const min = Math.ceil(cap(low)) + (loExclusive && Number.isInteger(low) ? 1 : 0);
      const max = Math.floor(cap(high)) - (hiExclusive && Number.isInteger(high) ? 1 : 0);
      if (min <= max) candidates.push(faker.number.int({ min, max }));
    } else {
      const margin = 0.01;
      const min = low + (loExclusive ? margin : 0);
      const max = high - (hiExclusive ? margin : 0);
      if (min <= max) candidates.push(faker.number.float({ min, max, fractionDigits: 2 }));
    }
    const found = candidates.find((value) => accepts(schema, value));
    if (found !== undefined) return found;
  }
  throw new GenerateError('Could not generate a number inside the schema bounds', ctx.path);
}

// ---------------------------------------------------------------- dates

function genDate(schema: Schema, ctx: Ctx): Date {
  const { faker } = ctx;
  let from: Date | undefined;
  let to: Date | undefined;
  for (const check of checksOf(schema)) {
    if (check.check === 'greater_than') from = check.value as Date;
    if (check.check === 'less_than') to = check.value as Date;
  }
  const end = to ?? new Date((from?.getTime() ?? REFERENCE_DATE.getTime() - 2 * 365 * 86_400_000) + 2 * 365 * 86_400_000);
  const start = from ?? new Date(end.getTime() - 2 * 365 * 86_400_000);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const candidates = [...hintCandidates(ctx.hint, 'date', faker), faker.date.between({ from: start, to: end })];
    const found = candidates.find((value) => accepts(schema, value));
    if (found !== undefined) return found as Date;
  }
  throw new GenerateError('Could not generate a date inside the schema bounds', ctx.path);
}
