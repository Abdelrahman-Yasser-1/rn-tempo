import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');

let scratch: string;
let project: string;
let bundle: string;

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

beforeAll(async () => {
  // Build the standalone target, then move it somewhere with no node_modules above it.
  await run(join(pkg, '../../node_modules/.bin/tsdown'), [], { cwd: pkg, timeout: 120_000 });
  scratch = mkdtempSync(join(tmpdir(), 'tempo-standalone-'));
  cpSync(join(pkg, 'dist/standalone'), join(scratch, 'standalone'), { recursive: true });
  bundle = join(scratch, 'standalone/tempo-api.mjs');
  project = join(scratch, 'project');
  cpSync(join(here, 'fixtures/basic'), project, { recursive: true });
  // The project's config imports its own copies of the contract package and Zod, as a real project does.
  symlinkSync(join(pkg, '../../node_modules'), join(project, 'node_modules'), 'dir');
}, 150_000);

afterAll(async () => {
  if (project !== undefined) await run(process.execPath, [bundle, 'down', '--cwd', project]).catch(() => undefined);
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
});

describe('standalone build', () => {
  it('runs with no node_modules next to it, serving the API, the info route and Swagger UI', async () => {
    expect(existsSync(join(scratch, 'node_modules'))).toBe(false);
    const port = await freePort();
    const up = await run(process.execPath, [bundle, 'up', '--cwd', project, '--port', String(port), '--host', '127.0.0.1', '--http']);
    expect(up.stdout).toContain(`http://localhost:${port}`);
    const base = `http://127.0.0.1:${port}`;
    const info = (await (await fetch(`${base}/__tempo/info`)).json()) as { service: string; port: number };
    expect(info).toMatchObject({ service: 'tempo-dev-api', port });
    expect((await fetch(`${base}/docs/`)).status).toBe(200);
    expect((await fetch(`${base}/docs/swagger-ui-bundle.js`)).status).toBe(200);
    expect((await fetch(`${base}/docs/openapi.json`)).status).toBe(200);
  });
});
