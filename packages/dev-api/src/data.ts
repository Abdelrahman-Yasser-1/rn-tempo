import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AnyDataContext, EndpointDefinition, ResourceBinding } from '@rn-tempo/api-contract';
import type { z } from 'zod';

import { generate, stableStringify } from './generate/index.ts';

export interface DataSource {
  /** Seed of the generator (`config.seed`). */
  seed: number;
  /** Folder of `<endpointId>.json` files; usually `fixtures/` next to the config. */
  fixturesDir?: string | undefined;
}

/** Fixture file for an endpoint id. `:` is also tried as `_` because it is not valid on Windows. */
export function fixturePath(fixturesDir: string, endpointId: string): string | undefined {
  for (const name of [endpointId, endpointId.replaceAll(':', '_')]) {
    const path = join(fixturesDir, `${name}.json`);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** Reads a fixture, or returns undefined when there is none. A broken file throws, naming the path. */
export function readFixture(
  fixturesDir: string | undefined,
  endpointId: string,
): { value: unknown } | undefined {
  if (fixturesDir === undefined) return undefined;
  const path = fixturePath(fixturesDir, endpointId);
  if (path === undefined) return undefined;
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) as unknown };
  } catch (error) {
    throw new Error(`Fixture ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Computes an endpoint's data. Fixed data wins over generation, in this order:
 * 1. the endpoint's own `data`, 2. `fixtures/<endpointId>.json`, 3. generated from the response schema.
 */
export async function resolveData(
  endpoint: EndpointDefinition,
  ctx: AnyDataContext,
  source: DataSource,
): Promise<unknown> {
  if (endpoint.data !== undefined) return await endpoint.data(ctx);
  const fixture = readFixture(source.fixturesDir, endpoint.id);
  if (fixture !== undefined) return fixture.value;
  return generate(endpoint.response as z.ZodType, {
    seed: source.seed,
    key: `${endpoint.id}|${stableStringify(ctx.params)}|${stableStringify(ctx.query)}`,
  });
}

/**
 * The first items of a resource: the ones the config lists, or `seed` items generated from the
 * schema. A numeric id field is numbered from 1, like dummyjson.
 */
export function seedItems(binding: ResourceBinding, seed: number): Record<string, unknown>[] {
  if (typeof binding.seed !== 'number') return binding.seed.map((item) => ({ ...item }));
  const shape = (binding.schema as unknown as { shape?: Record<string, { _zod: { def: { type: string } } }> }).shape;
  const numericId = shape?.[binding.idField]?._zod.def.type === 'number';
  return Array.from({ length: binding.seed }, (_, index) => {
    const item = generate(binding.schema as z.ZodType, {
      seed,
      key: `resource:${binding.name}#${index}`,
    }) as Record<string, unknown>;
    return numericId ? { ...item, [binding.idField]: index + 1 } : item;
  });
}
