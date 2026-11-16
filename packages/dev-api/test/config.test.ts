import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findTsconfig, loadConfig } from '../src/cli/config.ts';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/basic');

describe('loadConfig', () => {
  it('loads a TypeScript config and resolves tsconfig paths aliases', async () => {
    const config = await loadConfig(join(fixture, 'api/tempo-api.config.ts'));
    expect(config.seed).toBe(7);
    expect(config.auth).toBe(true);
    expect(config.endpoints.map((e) => e.id)).toEqual([
      'list.products',
      'get.products',
      'create.products',
      'update.products',
      'delete.products',
      'get.profile',
    ]);
    // The product schema came through `@features/products/schema`.
    expect(config.resources[0]?.schema.safeParse({ id: 1, title: 'x', price: 5 }).success).toBe(true);
  });

  it('finds the nearest tsconfig', () => {
    expect(findTsconfig(join(fixture, 'api'))).toBe(join(fixture, 'tsconfig.json'));
  });

  it('explains a missing config file', async () => {
    await expect(loadConfig(join(fixture, 'api/missing.ts'))).rejects.toThrow(/Config file not found.*--config/);
  });

  it('rejects a config without defineConfig', async () => {
    await expect(loadConfig(join(fixture, 'tsconfig.json'))).rejects.toThrow(/defineConfig/);
  });
});
