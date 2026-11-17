import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { join } from 'node:path';

import { createCerts, realRunner } from '@rn-tempo/dev-api';
import { afterEach, describe, expect, it } from 'vitest';

import { startBackend } from '../src/app.ts';
import { prepareDataDir } from '../src/folder.ts';

import { json, stopAll, tempDir } from './helpers.ts';

afterEach(stopAll);

const hasMkcert = spawnSync('mkcert', ['-version']).status === 0;
const definition = { name: 'tls', endpoints: [{ id: 'hi', type: 'static', method: 'GET', path: '/hi', body: { hi: true } }] };

function get(port: number, path: string, ca: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path, ca, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HTTPS', () => {
  it.skipIf(!hasMkcert)('serves over TLS with an mkcert certificate from a temporary CAROOT (verification stays on)', async () => {
    const caroot = tempDir();
    const dir = tempDir();
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(definition));
    const previous = process.env.CAROOT;
    process.env.CAROOT = caroot; // mkcert makes its CA here; no trust store is touched without `-install`
    try {
      createCerts({ outDir: join(prepareDataDir(dir), 'certs'), extraHosts: [], install: false, lan: undefined }, realRunner, () => undefined);
    } finally {
      if (previous === undefined) delete process.env.CAROOT;
      else process.env.CAROOT = previous;
    }
    const backend = await startBackend(dir, { port: 0, host: '127.0.0.1' });
    try {
      expect(backend.scheme).toBe('https');
      const ca = readFileSync(join(caroot, 'rootCA.pem'), 'utf8');
      const ok = await get(backend.port, '/hi', ca);
      expect(ok).toMatchObject({ status: 200 });
      expect(JSON.parse(ok.body)).toEqual({ hi: true });
      expect((await get(backend.port, '/__health', ca)).status).toBe(200);
      // Without the CA the certificate is rejected: nothing disables verification.
      await expect(get(backend.port, '/hi', '')).rejects.toThrow(/certificate|self.signed|unable to/i);
      // The admin listener stays plain HTTP on loopback and is not on the TLS port.
      expect((await get(backend.port, '/__admin/definition', ca)).status).toBe(404);
    } finally {
      await backend.stop();
    }
  });

  it('falls back to HTTP with a notice when there is no certificate', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(definition));
    const backend = await startBackend(dir, { port: 0, host: '127.0.0.1' });
    try {
      expect(backend.scheme).toBe('http');
      expect(backend.notice).toMatch(/No certificate/);
      expect(await json(await fetch(`http://127.0.0.1:${backend.port}/hi`))).toEqual({ hi: true });
    } finally {
      await backend.stop();
    }
  });
});

describe('CLI', () => {
  it('create then serve prints one ready line with the admin token, and stops on SIGTERM', async () => {
    const dir = join(tempDir(), 'cli-backend');
    const cli = join(import.meta.dirname, '../src/cli.ts');
    const created = spawnSync('node', [cli, 'create', dir, '--name', 'cli', '--preset', 'products'], { encoding: 'utf8' });
    expect(created.status).toBe(0);
    expect(existsSync(join(dir, 'backend.json'))).toBe(true);

    const child = spawn('node', [cli, 'serve', dir, '--http', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const ready = await new Promise<{ port: number; admin: { port: number; token: string } }>((resolve, reject) => {
      child.on('error', reject);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        const line = stdout.split('\n')[0];
        if (stdout.includes('\n') && line !== undefined) resolve(JSON.parse(line) as { port: number; admin: { port: number; token: string } });
      });
    });
    try {
      expect(ready.admin.token).toMatch(/^[0-9a-f]{64}$/);
      expect(stdout.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toContain(ready.admin.token);
      const list = await json(await fetch(`http://127.0.0.1:${ready.port}/products?limit=1`));
      expect(list).toMatchObject({ total: 2 });
    } finally {
      child.kill('SIGTERM');
    }
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(code).toBe(0);
    expect(stderr).not.toContain(ready.admin.token);
  });

  it('refuses to create over an existing backend and reports a bad backend.json', () => {
    const dir = tempDir();
    const cli = join(import.meta.dirname, '../src/cli.ts');
    expect(spawnSync('node', [cli, 'create', dir], { encoding: 'utf8' }).status).toBe(0);
    const again = spawnSync('node', [cli, 'create', dir], { encoding: 'utf8' });
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/already exists/);
    writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'x', port: 0 }));
    const serve = spawnSync('node', [cli, 'serve', dir, '--http'], { encoding: 'utf8' });
    expect(serve.status).toBe(1);
    expect(serve.stderr).toMatch(/port/);
  });
});
