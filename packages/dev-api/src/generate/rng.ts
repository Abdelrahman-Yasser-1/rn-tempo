import { base, en, Faker } from '@faker-js/faker';

/** Fixed so `faker.date.*` never depends on the clock; the same seed gives the same data on any day. */
export const REFERENCE_DATE = new Date('2026-01-01T00:00:00.000Z');

/** FNV-1a: a small, stable string hash. Not for security; it only spreads keys over seeds. */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('\u0000')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** JSON with sorted keys, so equal params always produce the same string. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

/** A fresh English-only faker (the default import loads every locale) with a fixed seed and date. */
export function createFaker(seed: number): Faker {
  const faker = new Faker({ locale: [en, base] });
  faker.seed(seed);
  faker.setDefaultRefDate(REFERENCE_DATE);
  return faker;
}
