import { execFile } from 'node:child_process';
import { cp, symlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateEndpoint } from '../src/lib/endpoint.ts';
import { makeTempDir, TEMPLATE_DIR } from './helpers.ts';

const run = promisify(execFile);

/** Runs a tool from the template's own node_modules in `dir`; rejects with its output on failure. */
async function tool(dir: string, bin: string, args: string[]): Promise<void> {
  try {
    await run(process.execPath, [path.join(dir, 'node_modules', bin), ...args], { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${bin} failed:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  }
}

// Needs the template's installed dependencies (its node_modules is linked in), so it runs only with
// `yarn test:e2e` (TEMPO_E2E=1), like the other tests that use the real template.
describe.skipIf(process.env.TEMPO_E2E !== '1')('tempo g endpoint on a copy of the real template', { timeout: 600_000 }, () => {
  let dir = '';
  let cleanup = async () => {};

  beforeAll(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-endpoint-tsc'));
    await cp(TEMPLATE_DIR, dir, {
      recursive: true,
      filter: (source) => !/(^|\/)(node_modules|ios|android|coverage|\.ai)(\/|$)/.test(path.relative(TEMPLATE_DIR, source)),
    });
    await symlink(path.join(TEMPLATE_DIR, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    const date = new Date('2026-03-04T12:00:00Z');
    await generateEndpoint('items.getItem', { projectDir: dir, date, path: '/items/:id' });
    await generateEndpoint('items.updateItem', { projectDir: dir, date, method: 'PUT', path: '/items/:id' });
    await generateEndpoint('items.createThing', { projectDir: dir, date, method: 'POST', path: '/things' });
    await generateEndpoint('items.removeItem', { projectDir: dir, date, method: 'DELETE', path: '/items/:id/remove' });
    await generateEndpoint('items.gadgets', { projectDir: dir, date, resource: true });
  });
  afterAll(async () => cleanup());

  it('typechecks', async () => {
    await tool(dir, 'typescript/bin/tsc', ['--noEmit']);
    expect(true).toBe(true);
  });

  it('passes prettier and eslint without fixes', async () => {
    await tool(dir, 'prettier/bin/prettier.cjs', ['--check', 'src/features/items']);
    await tool(dir, 'eslint/bin/eslint.js', ['--max-warnings=0', 'src/features/items']);
    expect(true).toBe(true);
  });
});
