import type { z } from 'zod';

import { createFaker, hashSeed } from './rng.ts';
import { GenerateError, TooDeepError, walk } from './walk.ts';

export { GenerateError } from './walk.ts';
export { hashSeed, stableStringify } from './rng.ts';

export interface GenerateOptions {
  /** The config seed. */
  seed: number;
  /**
   * Distinguishes values that share a seed: the endpoint id plus its params, or a resource item
   * number. The same seed and key always give the same value.
   */
  key?: string;
}

const ATTEMPTS = 25;

/**
 * Generates a value that `schema` parses, deterministically for a seed and key.
 *
 * Realistic values come from field names (`email`, `price`, `createdAt`, ...) and `.meta({ example })`
 * overrides a field. Schemas with custom `refine` checks are retried; if no attempt passes, a
 * `GenerateError` explains where, because sending an invalid value would be worse than failing.
 */
export function generate(schema: z.ZodType, options: GenerateOptions): unknown {
  const faker = createFaker(hashSeed(options.seed, options.key ?? ''));
  let lastIssue = '';
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let value: unknown;
    try {
      value = walk(schema, { faker, depth: 0, hint: undefined, path: '' });
    } catch (error) {
      if (error instanceof GenerateError) throw error;
      if (error instanceof TooDeepError) {
        throw new GenerateError('Schema nests too deeply to generate', '');
      }
      throw error;
    }
    const result = schema.safeParse(value);
    if (result.success) return value;
    lastIssue = result.error.issues[0]?.message ?? '';
  }
  throw new GenerateError(`No generated value passed the schema after ${ATTEMPTS} attempts: ${lastIssue}`, '');
}
