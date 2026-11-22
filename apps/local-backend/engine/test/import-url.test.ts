import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';

import { checkImportUrl, fetchApiFile, isPrivateAddress, MAX_REDIRECTS } from '../src/import/fetch-url.ts';

import { member, startSite, stopTeams } from './team-helpers.ts';
import { fixture } from './import-helpers.ts';

let server: Server;
let base = '';
const hangers: (() => void)[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/ok.json') return void res.writeHead(200, { 'content-type': 'application/json' }).end(fixture('petstore-swagger2.json'));
    if (url === '/big.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      const chunk = Buffer.alloc(1024 * 1024, 32);
      for (let i = 0; i < 11; i += 1) res.write(chunk);
      return void res.end();
    }
    if (url === '/declared-big.json') return void res.writeHead(200, { 'content-length': String(20 * 1024 * 1024) }).end('x');
    if (url === '/slow.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
      hangers.push(() => res.destroy());
      return;
    }
    const hop = /^\/hop(\d)$/.exec(url);
    if (hop !== null) return void res.writeHead(302, { location: Number(hop[1]) >= 5 ? '/ok.json' : `/hop${String(Number(hop[1]) + 1)}` }).end();
    if (url === '/to-file') return void res.writeHead(302, { location: 'file:///etc/passwd' }).end();
    if (url === '/to-metadata') return void res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' }).end();
    if (url === '/to-http') return void res.writeHead(302, { location: 'http://example.com/api.json' }).end();
    if (url === '/missing') return void res.writeHead(404).end();
    res.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  for (const stop of hangers) stop();
  await new Promise<void>((done) => server.close(() => done()));
});

afterEach(stopTeams);

describe('AC-LP-5 URL import guards', () => {
  it('AC-LP-5 downloads a file from localhost in local mode', async () => {
    const got = await fetchApiFile(`${base}/ok.json`, { allowPrivate: true });
    expect(got.text).toContain('"swagger"');
  });

  it('AC-LP-5 accepts only https, and http only for localhost; never file:', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://example.com/a.json', 'javascript:alert(1)', 'http://example.com/a.json', 'http://10.0.0.5/a.json', 'not a url', 'https://user:pw@example.com/a.json']) {
      expect(() => checkImportUrl(bad, true), bad).toThrow();
    }
    expect(() => checkImportUrl('https://example.com/a.json', false)).not.toThrow();
    expect(() => checkImportUrl('http://localhost:3000/a.json', true)).not.toThrow();
    expect(() => checkImportUrl('https://192.168.1.5/a.json', true)).not.toThrow();
  });

  it('AC-LP-5 refuses more than 10 MB, whether announced or streamed', async () => {
    await expect(fetchApiFile(`${base}/big.json`, { allowPrivate: true })).rejects.toThrow(/larger than 10 MB/);
    await expect(fetchApiFile(`${base}/declared-big.json`, { allowPrivate: true })).rejects.toThrow(/larger than 10 MB/);
  });

  it('AC-LP-5 gives up when the server is too slow', async () => {
    const started = Date.now();
    await expect(fetchApiFile(`${base}/slow.json`, { allowPrivate: true, timeoutMs: 300 })).rejects.toThrow(/did not answer within/);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('AC-LP-5 follows at most 3 redirects and checks every hop again', async () => {
    expect(MAX_REDIRECTS).toBe(3);
    expect((await fetchApiFile(`${base}/hop3`, { allowPrivate: true })).text).toContain('swagger');
    await expect(fetchApiFile(`${base}/hop0`, { allowPrivate: true })).rejects.toThrow(/redirected more than 3 times/);
    await expect(fetchApiFile(`${base}/to-file`, { allowPrivate: true })).rejects.toThrow(/https/);
    await expect(fetchApiFile(`${base}/to-http`, { allowPrivate: true })).rejects.toThrow(/https/);
    await expect(fetchApiFile(`${base}/to-metadata`, { allowPrivate: false })).rejects.toThrow();
    await expect(fetchApiFile(`${base}/missing`, { allowPrivate: true })).rejects.toThrow(/answered 404/);
  });

  it('AC-LP-5 on a team server refuses private, loopback and link-local addresses, literal or resolved', async () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:a00:1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(address), address).toBe(false);
    await expect(fetchApiFile(`${base}/ok.json`, { allowPrivate: false })).rejects.toThrow(/private network/);
    await expect(fetchApiFile('https://169.254.169.254/latest', { allowPrivate: false })).rejects.toThrow(/private network/);
    await expect(fetchApiFile('https://[::1]/x', { allowPrivate: false })).rejects.toThrow(/private network/);
    await expect(fetchApiFile('https://internal.example/api.json', { allowPrivate: false, resolve: () => Promise.resolve(['93.184.216.34', '10.0.0.8']) })).rejects.toThrow(/private network/);
    await expect(fetchApiFile('https://nowhere.example/api.json', { allowPrivate: false, resolve: () => Promise.reject(new Error('ENOTFOUND')) })).rejects.toThrow(/Could not find the host/);
  });

  it('AC-LP-5 a team server refuses a URL import by default, and allows it with the opt-out', async () => {
    const strict = await startSite();
    const editor = await member(strict, 'ed@example.com', 'editor');
    const refused = await editor.admin('demo', 'POST', '/import/preview', { url: `${base}/ok.json` });
    expect(refused.status).toBe(400);
    expect(refused.body).toContain('private network');
    const lan = await startSite({ allowPrivateImportUrls: true });
    const allowed = await lan.owner.admin('demo', 'POST', '/import/preview', { url: `${base}/ok.json` });
    expect(allowed.status, allowed.body).toBe(200);
    expect((allowed.json() as { source: string }).source).toBe(`${base}/ok.json`);
  });
});
