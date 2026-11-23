import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const fixture = (name: string): string => readFileSync(join(here, 'fixtures', name), 'utf8');
export const templateOpenApi = (): string => readFileSync(join(here, 'fixtures/template-openapi.json'), 'utf8');

/** A small file whose `$ref`s fan out: every schema uses the one before it 12 times, so 7 levels expand to 12^7 nodes. */
export function refBomb(levels = 7, fan = 12): string {
  const schemas: Record<string, unknown> = { S0: { type: 'string' } };
  for (let i = 1; i <= levels; i += 1) {
    const properties = Object.fromEntries(Array.from({ length: fan }, (_unused, n) => [`p${String(n)}`, { $ref: `#/components/schemas/S${String(i - 1)}` }]));
    schemas[`S${String(i)}`] = { type: 'object', properties };
  }
  return JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Bomb', version: '1' },
    paths: { '/x': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: `#/components/schemas/S${String(levels)}` } } } } } } } },
    components: { schemas },
  });
}
