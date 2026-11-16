import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { certNames, createCerts, DEFAULT_NAMES, MKCERT_HINT, mkcertArgs, splitHosts, type RunResult, type Runner } from '../src/cli/certs.ts';
import { resolvePaths } from '../src/cli/paths.ts';
import { readPid, writePid } from '../src/cli/process.ts';
import { certCoversIp, chooseScheme, targetFor } from '../src/cli/tls.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });

/** A runner that records calls instead of running anything. */
function fakeRunner(caRoot: string, overrides: Partial<Record<string, RunResult>> = {}): { run: Runner; calls: string[][] } {
  const calls: string[][] = [];
  const run: Runner = (command, args) => {
    calls.push([command, ...args]);
    const keyAt = args.indexOf('-key-file');
    if (keyAt !== -1) writeFileSync(args[keyAt + 1] ?? '', 'FAKE KEY'); // what mkcert would write
    return overrides[command] ?? (args[0] === '-CAROOT' ? ok(`${caRoot}\n`) : ok());
  };
  return { run, calls };
}

describe('certs command (injected runner)', () => {
  let work: string;
  let caRoot: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'tempo-certs-'));
    caRoot = join(work, 'ca');
    mkdirSync(caRoot);
    writeFileSync(join(caRoot, 'rootCA.pem'), 'PUBLIC CA');
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  it('builds the mkcert arguments for the default names and the LAN address', () => {
    const out = join(work, 'out');
    const { run, calls } = fakeRunner(caRoot);
    createCerts({ outDir: out, extraHosts: ['my.test'], install: false, lan: '192.168.1.20' }, run, () => undefined);
    expect(calls[0]).toEqual(['mkcert', '-CAROOT']);
    expect(calls[1]).toEqual([
      'mkcert',
      ...mkcertArgs(out, [...DEFAULT_NAMES, '192.168.1.20', 'my.test']),
    ]);
    expect(calls[1]).toContain(join(out, 'cert.pem'));
    expect(calls[1]).toContain(join(out, 'key.pem'));
    for (const name of ['localhost', '127.0.0.1', '::1', '10.0.2.2', 'dev-api.tempo.test', 'api.tempo.test', 'portal.tempo.test']) {
      expect(calls[1]).toContain(name);
    }
    expect(readFileSync(join(out, 'rootCA.pem'), 'utf8')).toBe('PUBLIC CA');
  });

  it('never installs into a trust store unless asked', () => {
    const quiet = fakeRunner(caRoot);
    createCerts({ outDir: join(work, 'a'), extraHosts: [], install: false, lan: undefined }, quiet.run, () => undefined);
    expect(quiet.calls.some((call) => call.includes('-install'))).toBe(false);

    const asked = fakeRunner(caRoot);
    createCerts({ outDir: join(work, 'b'), extraHosts: [], install: true, lan: undefined }, asked.run, () => undefined);
    expect(asked.calls.filter((call) => call.includes('-install'))).toEqual([['mkcert', '-install']]);
  });

  it('fails with the install hint when mkcert is missing', () => {
    const missing: Runner = () => ({ status: null, stdout: '', stderr: '', error: new Error('spawn mkcert ENOENT') });
    expect(() => createCerts({ outDir: work, extraHosts: [], install: false, lan: undefined }, missing, () => undefined)).toThrow(MKCERT_HINT);
    expect(MKCERT_HINT).toContain('brew install mkcert');
  });

  it('merges repeated and comma-separated --host values without duplicates', () => {
    expect(splitHosts(['certs', '--host', 'a.test,b.test', '--host=c.test', '--out', 'x'])).toEqual(['a.test', 'b.test', 'c.test']);
    expect(certNames(['localhost', 'z.test'], '10.0.0.5').filter((n) => n === 'localhost')).toHaveLength(1);
  });
});

describe('scheme choice and the pid record', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'tempo-scheme-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is https only when both files exist and --http is not set', () => {
    const paths = resolvePaths(dir, undefined);
    expect(chooseScheme(paths, false)).toBe('http');
    mkdirSync(paths.certsDir, { recursive: true });
    writeFileSync(join(paths.certsDir, 'cert.pem'), 'x');
    expect(chooseScheme(paths, false)).toBe('http'); // the key is missing
    writeFileSync(join(paths.certsDir, 'key.pem'), 'x');
    expect(chooseScheme(paths, false)).toBe('https');
    expect(chooseScheme(paths, true)).toBe('http');
  });

  it('records the scheme, and an old record means http', () => {
    const paths = resolvePaths(dir, undefined);
    mkdirSync(paths.dataDir, { recursive: true });
    writePid(paths.pidFile, { pid: 1, port: 8443, host: '0.0.0.0', scheme: 'https' });
    expect(readPid(paths.pidFile)?.scheme).toBe('https');
    writeFileSync(paths.pidFile, JSON.stringify({ pid: 1, port: 8443, host: '0.0.0.0' }));
    expect(readPid(paths.pidFile)?.scheme).toBe('http');
  });

  it('targets https with the generated CA only when the record says https', () => {
    const paths = resolvePaths(dir, undefined);
    mkdirSync(paths.certsDir, { recursive: true });
    writeFileSync(join(paths.certsDir, 'rootCA.pem'), 'CA PEM');
    expect(targetFor(paths, { port: 1, scheme: 'http' })).toEqual({ scheme: 'http', port: 1 });
    expect(targetFor(paths, { port: 1, scheme: 'https' })).toEqual({ scheme: 'https', port: 1, ca: 'CA PEM' });
  });

  it('treats unreadable certificate text as not covering an address', () => {
    expect(certCoversIp('not a certificate', '10.0.0.1')).toBe(false);
  });
});

// The next tests use a real certificate made by mkcert with a temporary CAROOT, so they never touch
// this computer's trust stores. They are skipped when mkcert is not installed (for example in CI).
const mkcertPath = (() => {
  try {
    return execFileSync('which', ['mkcert'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();

describe.skipIf(mkcertPath === '')('https server (needs mkcert; skipped when it is not installed)', () => {
  const run = promisify(execFile);
  const bin = join(here, '../src/bin.ts');
  let caRoot: string;
  let dir: string;
  let port: number;

  beforeAll(() => {
    caRoot = mkdtempSync(join(tmpdir(), 'tempo-caroot-'));
  });
  afterAll(() => rmSync(caRoot, { recursive: true, force: true }));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tempo-https-'));
    cpSync(join(here, 'fixtures/basic'), dir, { recursive: true });
    symlinkSync(join(here, '../../../node_modules'), join(dir, 'node_modules'), 'dir');
    port = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1', () => {
        const { port: found } = probe.address() as { port: number };
        probe.close(() => resolve(found));
      });
    });
  });
  afterEach(async () => {
    await api('down');
    rmSync(dir, { recursive: true, force: true });
  });

  async function api(...args: string[]): Promise<{ code: number; out: string; err: string }> {
    try {
      const { stdout, stderr } = await run(process.execPath, [bin, ...args, '--cwd', dir], {
        cwd: dir,
        timeout: 25_000,
        env: { ...process.env, CAROOT: caRoot },
      });
      return { code: 0, out: stdout, err: stderr };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
    }
  }

  const secureGet = (path: string, ca: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = request({ host: 'localhost', port, path, ca }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });

  it('serves over https after certs, drives the control client, and --http forces plain http', async () => {
    const certs = await api('certs');
    expect(certs.code, certs.err).toBe(0);
    for (const file of ['cert.pem', 'key.pem', 'rootCA.pem']) expect(existsSync(join(dir, '.tempo-api/certs', file))).toBe(true);
    const ca = readFileSync(join(caRoot, 'rootCA.pem'), 'utf8');
    const cert = readFileSync(join(dir, '.tempo-api/certs/cert.pem'));
    expect(certCoversIp(cert, '10.0.2.2')).toBe(true);
    expect(certCoversIp(cert, '127.0.0.1')).toBe(true);
    expect(certCoversIp(cert, '203.0.113.9')).toBe(false);

    const up = await api('up', '--port', String(port), '--host', '127.0.0.1');
    expect(up.code, up.err).toBe(0);
    expect(up.out).toContain(`https://localhost:${port}`);
    expect(JSON.parse(readFileSync(join(dir, '.tempo-api/server.pid'), 'utf8')).scheme).toBe('https');

    expect((await secureGet('/products/2', ca)).status).toBe(200);
    // An unrelated CA must not be trusted: certificate checks stay on.
    await expect(secureGet('/products/2', '')).rejects.toThrow();

    expect((await api('status')).out).toContain(`https://localhost:${port}`);
    const set = await api('scenario', 'set', 'get.products', 'notFound');
    expect(set.code, set.err).toBe(0);
    expect((await secureGet('/products/2', ca)).status).toBe(404);
    expect((await api('scenario', 'clear')).code).toBe(0);
    expect((await secureGet('/products/2', ca)).status).toBe(200);
    expect((await api('down')).out).toMatch(/stopped/);

    const plain = await api('up', '--port', String(port), '--host', '127.0.0.1', '--http');
    expect(plain.code, plain.err).toBe(0);
    expect(plain.out).toContain(`http://localhost:${port}`);
    expect((await fetch(`http://127.0.0.1:${port}/products/2`)).status).toBe(200);
    expect(JSON.parse(readFileSync(join(dir, '.tempo-api/server.pid'), 'utf8')).scheme).toBe('http');
    expect((await api('scenario', 'set', 'get.products', 'notFound')).code).toBe(0);
  });

  it('prints the one-line hint and serves http when there is no certificate', async () => {
    const up = await api('up', '--port', String(port), '--host', '127.0.0.1');
    expect(up.code, up.err).toBe(0);
    expect(up.out).toContain('No certificate: serving HTTP. Run `yarn api certs` for HTTPS.');
    expect(up.out).toContain(`http://localhost:${port}`);
  });
});
