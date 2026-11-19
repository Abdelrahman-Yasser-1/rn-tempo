// Smoke test of the single executable built by `yarn build:sea`: it creates a backend with the binary, serves it,
// waits for the `ready` line, and checks /__health, the Swagger UI asset (a SEA asset), a handler (a worker thread)
// and the database, over HTTP and then over HTTPS with a certificate from a temporary CAROOT (no trust store is
// touched and TLS verification stays on: the request trusts only that temporary CA).
// Usage: node scripts/smoke-sea.ts [--binary <path>] [--require-https]
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: { binary: { type: 'string' }, 'require-https': { type: 'boolean' } } });
const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const triple = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const binary = resolve(values.binary ?? join(engineDir, '../app/src-tauri/binaries', `tempo-engine-${triple}`));

const children: ChildProcess[] = [];
const workDirs: string[] = [];

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address !== null ? done(address.port) : fail(new Error('no port'))));
    });
  });
}

function startServing(dir: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(binary, ['serve', dir, ...args, '--parent-stdin'], { stdio: ['pipe', 'pipe', 'pipe'], env });
  children.push(child);
  return new Promise((done, fail) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.once('exit', (code) => fail(new Error(`the engine exited (${String(code)}) before ready: ${stderr.slice(-400)}`)));
    const timer = setTimeout(() => fail(new Error('no ready line in 30 seconds')), 30_000);
    let buffer = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // Only the `ready` event is checked; the line carries the admin token, so it is never printed.
      if (buffer.split('\n').some((line) => line.includes('"event":"ready"'))) {
        clearTimeout(timer);
        done();
      }
    });
  });
}

/** Starts `web` from the executable and checks the dashboard page and one of its hashed files come out of the SEA assets. */
async function checkDashboard(work: string, env: NodeJS.ProcessEnv): Promise<void> {
  const adminPort = await freePort();
  const child = spawn(binary, ['web', '--backends-dir', join(work, 'web-backends'), '--admin-port', String(adminPort), '--no-open'], { stdio: ['ignore', 'pipe', 'pipe'], env });
  children.push(child);
  await new Promise<void>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('web printed no dashboard address in 30 seconds')), 30_000);
    let buffer = '';
    child.once('exit', (code) => fail(new Error(`web exited (${String(code)}) early`)));
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // The login code is on a line of its own and is never printed here.
      if (buffer.includes('Login code:')) {
        clearTimeout(timer);
        done();
      }
    });
  });
  const base = `http://127.0.0.1:${String(adminPort)}`;
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check(page.status === 200 && html.includes('<div id="root">') && (page.headers.get('content-security-policy') ?? '').includes("connect-src 'self'"), 'the dashboard index is served from the SEA, with its CSP');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  const asset = script === undefined ? undefined : await fetch(`${base}${script}`);
  check(asset?.status === 200 && (asset.headers.get('cache-control') ?? '').includes('immutable'), 'a hashed dashboard file is served with immutable caching');
  check((await fetch(`${base}/__hub/backends`)).status === 401, 'the admin routes need a session');
  child.kill('SIGTERM');
}

async function stopAll(): Promise<void> {
  await Promise.all(
    children.splice(0).map(
      (child) =>
        new Promise<void>((done) => {
          if (child.exitCode !== null) return done();
          child.removeAllListeners('exit');
          child.once('exit', () => done());
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 5000).unref();
        }),
    ),
  );
}

function check(condition: boolean, what: string): void {
  if (!condition) throw new Error(`FAILED: ${what}`);
  process.stdout.write(`ok  ${what}\n`);
}

const httpsGet = (port: number, path: string, ca: string): Promise<{ status: number; body: string }> =>
  new Promise((done, fail) => {
    const req = request({ host: 'localhost', port, path, ca, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    });
    req.once('error', fail);
    req.end();
  });

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'tempo-sea-'));
  workDirs.push(work);
  const dir = join(work, 'backend');
  const caroot = join(work, 'caroot');
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', HOME: work, CAROOT: caroot };
  const port = await freePort();
  execFileSync(binary, ['create', dir, '--name', 'smoke', '--preset', 'tempo-template', '--port', String(port)], { env, stdio: 'ignore' });

  await startServing(dir, ['--http', '--no-watch'], env);
  const base = `http://127.0.0.1:${String(port)}`;
  const health = await fetch(`${base}/__health`);
  check(health.status === 200 && ((await health.json()) as { ok?: boolean }).ok === true, 'HTTP /__health answers ok');
  const css = await fetch(`${base}/__docs/swagger-ui.css`);
  check(css.status === 200 && (await css.text()).length > 1000, 'Swagger UI asset is served (SEA asset)');
  const stats = await fetch(`${base}/stats/summary`);
  check(stats.status === 200 && ((await stats.json()) as { products?: number }).products === 100, 'a handler runs in a worker and the database answers');
  await stopAll();
  await checkDashboard(work, env);
  await stopAll();

  let mkcert = true;
  try {
    execFileSync('mkcert', ['-version'], { stdio: 'ignore' });
  } catch {
    mkcert = false;
  }
  if (!mkcert) {
    if (values['require-https'] === true) throw new Error('FAILED: mkcert is needed for the HTTPS check (--require-https)');
    process.stdout.write('skip  HTTPS check (mkcert is not installed)\n');
    return;
  }
  execFileSync(binary, ['certs', dir], { env, stdio: 'ignore' });
  await startServing(dir, ['--no-watch'], env);
  const secure = await httpsGet(port, '/__health', readFileSync(join(caroot, 'rootCA.pem'), 'utf8'));
  check(secure.status === 200 && secure.body.includes('"ok":true'), 'HTTPS /__health answers ok (verified against the temporary CA)');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopAll();
    for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
  });
