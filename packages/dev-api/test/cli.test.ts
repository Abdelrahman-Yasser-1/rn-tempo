import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '../src/bin.ts');
const repoModules = join(here, '../../../node_modules');

let dir: string;
let port: number;
const strays: ChildProcess[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port: found } = probe.address() as { port: number };
      probe.close(() => resolve(found));
    });
  });
}

/** Runs tempo-api in the temp project. Never throws; exit codes are part of the contract. */
async function api(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args, '--cwd', dir], { cwd: dir, timeout: 25_000 });
    return { code: 0, out: stdout, err: stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}

const get = (path: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`http://127.0.0.1:${port}${path}`, { headers });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-cli-'));
  cpSync(join(here, 'fixtures/basic'), dir, { recursive: true });
  // The config imports the workspace packages, so the temp project borrows the repo's node_modules.
  symlinkSync(repoModules, join(dir, 'node_modules'), 'dir');
  port = await freePort();
});

afterEach(async () => {
  await api('down');
  for (const stray of strays.splice(0)) stray.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

describe('tempo-api lifecycle', () => {
  it('runs up, status, scenario set, a request and down', async () => {
    expect((await api('status')).out).toMatch(/not running/);

    const up = await api('up', '--port', String(port), '--host', '127.0.0.1');
    expect(up.code, up.err).toBe(0);
    expect(up.out).toContain(`http://localhost:${port}`);
    expect(existsSync(join(dir, '.tempo-api/server.pid'))).toBe(true);
    expect(existsSync(join(dir, '.tempo-api/server.log'))).toBe(true);

    const again = await api('up', '--port', String(port), '--host', '127.0.0.1');
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/already running/);

    const status = await api('status');
    expect(status.out).toMatch(/is running \(pid \d+/);

    // Generated data is stable.
    const first = await (await get('/profile')).text();
    const second = await (await get('/profile')).text();
    expect(first).toBe(second);
    expect(JSON.parse(first)).toHaveProperty('email');
    expect((await get('/products/2')).status).toBe(200);

    const set = await api('scenario', 'set', 'get.products', 'notFound');
    expect(set.code, set.err).toBe(0);
    expect((await get('/products/2')).status).toBe(404);
    expect((await api('status')).out).toMatch(/get\.products -> notFound/);

    expect((await api('scenario', 'set', 'get.products', 'nope')).code).toBe(1);
    expect((await api('scenario', 'set', 'unknown.id', 'notFound')).code).toBe(1);

    await api('scenario', 'clear');
    expect((await get('/products/2')).status).toBe(200);

    await fetch(`http://127.0.0.1:${port}/products/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Extra', price: 5 }),
    });
    expect(((await (await get('/products')).json()) as { total: number }).total).toBe(6);
    expect((await api('reset')).code).toBe(0);
    expect(((await (await get('/products')).json()) as { total: number }).total).toBe(5);

    const logs = await api('logs', '-n', '5');
    expect(logs.out).toMatch(/request/);

    const pid = Number(JSON.parse(readFileSync(join(dir, '.tempo-api/server.pid'), 'utf8')).pid);
    const down = await api('down');
    expect(down.code).toBe(0);
    expect(down.out).toMatch(/stopped/);
    expect(existsSync(join(dir, '.tempo-api/server.pid'))).toBe(false);
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(get('/profile')).rejects.toThrow();
  });

  it('does not start a second server on a busy port and reports why', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));
    try {
      const up = await api('up', '--port', String(port), '--host', '127.0.0.1');
      expect(up.code).toBe(1);
      expect(up.err).toMatch(/did not start/);
      expect(existsSync(join(dir, '.tempo-api/server.pid'))).toBe(false);
    } finally {
      blocker.close();
    }
  });

  it('reports a broken config in the terminal', async () => {
    writeFileSync(join(dir, 'api/tempo-api.config.ts'), 'export default { nope: true };\n');
    const up = await api('up', '--port', String(port));
    expect(up.code).toBe(1);
    expect(up.err).toMatch(/defineConfig/);
  });

  it('refuses to call the control routes when nothing runs', async () => {
    const set = await api('scenario', 'set', 'get.products', 'notFound');
    expect(set.code).toBe(1);
    expect(set.err).toMatch(/not running/);
  });
});

describe('stale pid files', () => {
  it('cleans up a pid file of a process that is gone', async () => {
    const gone = spawn(process.execPath, ['-e', '']);
    await new Promise((resolve) => gone.once('exit', resolve));
    mkdirSync(join(dir, '.tempo-api'), { recursive: true });
    const pidFile = join(dir, '.tempo-api/server.pid');
    writeFileSync(pidFile, JSON.stringify({ pid: gone.pid, port, host: '127.0.0.1' }));

    expect((await api('status')).out).toMatch(/not running.*stale/);
    const down = await api('down');
    expect(down.code).toBe(0);
    expect(down.out).toMatch(/stale pid file/);
    expect(existsSync(pidFile)).toBe(false);
  });

  it('starts normally over a stale pid file', async () => {
    const gone = spawn(process.execPath, ['-e', '']);
    await new Promise((resolve) => gone.once('exit', resolve));
    mkdirSync(join(dir, '.tempo-api'), { recursive: true });
    writeFileSync(join(dir, '.tempo-api/server.pid'), JSON.stringify({ pid: gone.pid, port, host: '127.0.0.1' }));
    const up = await api('up', '--port', String(port), '--host', '127.0.0.1');
    expect(up.code, up.err).toBe(0);
    expect(up.out).toMatch(/is running/);
    expect((await get('/profile')).status).toBe(200);
  });

  it('never kills a live process that is not the dev API', async () => {
    const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    strays.push(bystander);
    const pid = bystander.pid as number;
    mkdirSync(join(dir, '.tempo-api'), { recursive: true });
    // The pid file names a live process, and the port answers nothing.
    writeFileSync(join(dir, '.tempo-api/server.pid'), JSON.stringify({ pid, port, host: '127.0.0.1' }));

    const down = await api('down');
    expect(down.code).toBe(0);
    expect(down.out).toMatch(/not the dev API/);
    expect(() => process.kill(pid, 0)).not.toThrow();
    expect(existsSync(join(dir, '.tempo-api/server.pid'))).toBe(false);
  });
});
