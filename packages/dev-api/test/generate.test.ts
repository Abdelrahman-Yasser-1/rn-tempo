import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { generate, GenerateError } from '../src/generate/index.ts';

type Node = { name: string; children: Node[] };
const NodeSchema: z.ZodType<Node> = z.object({
  name: z.string(),
  get children() {
    return z.array(NodeSchema);
  },
});

const LazyNode: z.ZodType<{ v: number; next?: { v: number } | undefined }> = z.lazy(() =>
  z.object({ v: z.number(), next: LazyNode.optional() }),
);

/** One entry per supported kind, plus the constraint variants the walker has to honour. */
const SCHEMAS: Record<string, z.ZodType> = {
  string: z.string(),
  'string min/max': z.string().min(8).max(12),
  'string exact': z.string().length(7),
  regex: z.string().regex(/^[A-Z]{3}-\d{4}$/),
  'regex alternation': z.string().regex(/^(red|green|blue)-\d{2,3}$/),
  email: z.email(),
  'email method': z.string().email(),
  url: z.url(),
  uuid: z.uuid(),
  datetime: z.iso.datetime(),
  'datetime local': z.iso.datetime({ local: true }),
  'datetime offset': z.iso.datetime({ offset: true }),
  date: z.iso.date(),
  time: z.iso.time(),
  ipv4: z.ipv4(),
  cuid2: z.cuid2(),
  e164: z.e164(),
  'starts/ends': z.string().startsWith('pre-').endsWith('-post').min(12),
  lowercase: z.string().lowercase(),
  number: z.number(),
  int: z.number().int().min(3).max(9),
  'int format': z.int(),
  int32: z.int32(),
  'float bounds': z.number().min(0.5).max(0.9),
  'exclusive bounds': z.number().gt(1).lt(2),
  'int exclusive': z.number().int().gt(4).lt(6),
  negative: z.number().max(-5),
  positive: z.number().positive(),
  multipleOf: z.number().multipleOf(5).min(10).max(50),
  coerceNumber: z.coerce.number().min(1),
  bigint: z.bigint(),
  boolean: z.boolean(),
  enum: z.enum(['a', 'b', 'c']),
  literal: z.literal('only'),
  'literal many': z.literal([1, 'x', true]),
  union: z.union([z.string(), z.number(), z.boolean()]),
  discriminated: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('a'), a: z.string() }),
    z.object({ kind: z.literal('b'), b: z.number() }),
  ]),
  intersection: z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
  optional: z.object({ a: z.string().optional() }),
  nullable: z.string().nullable(),
  default: z.string().default('fallback'),
  readonly: z.object({ a: z.string() }).readonly(),
  catch: z.number().catch(1),
  null: z.null(),
  array: z.array(z.string()),
  'array min/max': z.array(z.number()).min(3).max(4),
  'array exact': z.array(z.number()).length(6),
  'array nonempty': z.array(z.string()).nonempty(),
  'array may be empty': z.array(z.string()).max(2),
  tuple: z.tuple([z.string(), z.number()]),
  'tuple rest': z.tuple([z.string()]).rest(z.number()),
  record: z.record(z.string(), z.number()),
  'record enum keys': z.record(z.enum(['x', 'y']), z.string()),
  'record regex keys': z.record(z.string().regex(/^k\d$/), z.number()),
  map: z.map(z.string(), z.number()),
  set: z.set(z.string()),
  'plain date': z.date(),
  'date bounds': z.date().min(new Date('2020-01-01')).max(new Date('2020-02-01')),
  'coerce date': z.coerce.date(),
  transform: z.string().transform((s) => s.length),
  preprocess: z.preprocess((v) => String(v), z.string()),
  'refine retry': z.number().int().min(0).max(9).refine((n) => n % 2 === 0),
  recursive: NodeSchema,
  lazy: LazyNode,
  'nested object': z.object({
    user: z.object({ id: z.number().int(), tags: z.array(z.string()), meta: z.record(z.string(), z.unknown()) }),
    items: z.array(z.object({ id: z.uuid(), at: z.iso.datetime(), price: z.number() })),
  }),
  'field heuristics': z.object({
    id: z.number().int(),
    email: z.email(),
    phone: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    username: z.string(),
    image: z.url(),
    thumbnail: z.url(),
    avatar: z.url(),
    title: z.string(),
    description: z.string(),
    price: z.number().min(0),
    rating: z.number().min(0).max(5),
    stock: z.number().int(),
    category: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.coerce.date(),
  }),
};

const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 1);

describe('generate: parses for every schema and seed', () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    it(name, () => {
      for (const seed of SEEDS) {
        for (const key of ['', 'get.items.:id|{"id":"1"}']) {
          const value = generate(schema, { seed, key });
          const result = schema.safeParse(value);
          expect(result.success, `${name} seed ${seed}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
        }
      }
    });
  }
});

describe('generate: determinism', () => {
  const schema = SCHEMAS['nested object'] as z.ZodType;

  it('gives the same value for the same seed and key', () => {
    expect(generate(schema, { seed: 7, key: 'a' })).toEqual(generate(schema, { seed: 7, key: 'a' }));
  });

  it('changes with the seed and with the key', () => {
    const base = generate(schema, { seed: 7, key: 'a' });
    expect(generate(schema, { seed: 8, key: 'a' })).not.toEqual(base);
    expect(generate(schema, { seed: 7, key: 'b' })).not.toEqual(base);
  });

  it('does not depend on the clock', () => {
    const dates = z.object({ createdAt: z.iso.datetime(), at: z.date() });
    const first = generate(dates, { seed: 1 });
    expect(generate(dates, { seed: 1 })).toEqual(first);
  });
});

describe('generate: realistic values from field names', () => {
  const value = generate(SCHEMAS['field heuristics'] as z.ZodType, { seed: 3 }) as Record<string, unknown>;

  it('uses faker for known names', () => {
    expect(value.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    expect(String(value.phone)).toMatch(/\d{3}/);
    expect(String(value.image)).toMatch(/^https?:\/\//);
    expect(String(value.firstName)).toMatch(/^[A-Z]/);
    expect(value.price).toBeGreaterThan(0);
    expect(value.rating).toBeGreaterThanOrEqual(1);
    expect(value.rating).toBeLessThanOrEqual(5);
    expect(String(value.createdAt)).toMatch(/^20\d\d-/);
  });

  it('falls back when a hint does not fit the schema', () => {
    const tight = z.object({ title: z.string().length(3), price: z.number().int().max(0) });
    const out = generate(tight, { seed: 1 }) as { title: string; price: number };
    expect(out.title).toHaveLength(3);
    expect(out.price).toBeLessThanOrEqual(0);
  });
});

describe('generate: overrides', () => {
  it('uses meta example', () => {
    const schema = z.object({ title: z.string().meta({ example: 'Fixed title' }), n: z.number().meta({ examples: [7] }) });
    expect(generate(schema, { seed: 1 })).toEqual({ title: 'Fixed title', n: 7 });
  });

  it('reads an example from describe', () => {
    const schema = z.object({ code: z.string().describe('Promo code. example: SAVE10') });
    expect(generate(schema, { seed: 1 })).toEqual({ code: 'SAVE10' });
  });

  it('ignores an example the schema rejects', () => {
    const schema = z.string().min(5).meta({ example: 'no' });
    expect(String(generate(schema, { seed: 1 }))).not.toBe('no');
  });
});

describe('generate: limits', () => {
  it('caps recursion', () => {
    const tree = generate(NodeSchema, { seed: 5 }) as Node;
    const depth = (n: Node): number => 1 + Math.max(0, ...n.children.map(depth));
    expect(depth(tree)).toBeLessThanOrEqual(8);
  });

  it('respects array limits', () => {
    const list = generate(z.array(z.number()).min(3).max(4), { seed: 5 }) as number[];
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(4);
  });

  it('throws a clear error for an unsupported schema', () => {
    expect(() => generate(z.never(), { seed: 1 })).toThrow(GenerateError);
    expect(() => generate(z.object({ a: z.never() }), { seed: 1 })).toThrow(/\.a/);
  });
});
