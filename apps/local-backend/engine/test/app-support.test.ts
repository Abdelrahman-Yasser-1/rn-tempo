import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBackend } from '../src/folder.ts';

import { stopAll, serve, tempDir } from './helpers.ts';

afterEach(stopAll);

describe('what the desktop app needs from the engine', () => {
  it('create --port writes the port into backend.json', () => {
    const dir = tempDir();
    createBackend(dir, { name: 'p', preset: 'empty', port: 8561 });
    expect((JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8')) as { port: number }).port).toBe(8561);
  });

  it('serves only the public CA, by fixed name, and 404s without one', async () => {
    const { dir, url } = await serve({ name: 'ca' });
    expect((await fetch(`${url}/__ca.pem`)).status).toBe(404);
    mkdirSync(join(dir, '.data/certs'), { recursive: true });
    writeFileSync(join(dir, '.data/certs/rootCA.pem'), '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n');
    writeFileSync(join(dir, '.data/certs/key.pem'), 'SECRET');
    const found = await fetch(`${url}/__ca.pem`);
    expect(found.status).toBe(200);
    expect(await found.text()).toContain('BEGIN CERTIFICATE');
    expect((await fetch(`${url}/__ca.pem/../key.pem`)).status).toBe(404);
  });

  it('serve --parent-stdin stops when the parent closes stdin', async () => {
    const dir = tempDir();
    createBackend(dir, { name: 'stdin', preset: 'empty' });
    const child = spawn(process.execPath, [resolve(import.meta.dirname, '../src/cli.ts'), 'serve', dir, '--http', '--port', '0', '--parent-stdin'], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((done, fail) => {
        child.stdout.once('data', () => done());
        child.once('error', fail);
      });
      const exited = new Promise<number | null>((done) => child.once('exit', done));
      child.stdin.end();
      expect(await exited).toBe(0);
    } finally {
      child.kill();
    }
  });
});
