import { get as httpGet, type IncomingMessage, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, defineEndpoint } from '@rn-tempo/api-contract';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runDev, type DevDeps } from '../src/cli/dev.ts';
import { resolvePaths } from '../src/cli/paths.ts';
import type { Runner, RunResult } from '../src/cli/certs.ts';
import { createLogger, createServer, listen, type DevServer, type ServerOptions } from '../src/index.ts';
import { MAX_BODY_CHARS, RequestLog, RING_SIZE, viewBody } from '../src/server/events.ts';

const login = defineEndpoint({
  method: 'POST',
  path: '/auth/login',
  body: z.object({ username: z.string(), password: z.string() }),
  response: z.object({ id: z.number(), accessToken: z.string() }),
  data: () => ({ id: 1, accessToken: 'abc.def.ghi' }),
  scenarios: { teapot: { status: 418, body: { message: 'teapot' } } },
});
const echo = defineEndpoint({
  method: 'POST',
  path: '/echo',
  body: z.object({ text: z.string() }),
  response: z.object({ length: z.number() }),
  data: ({ body }) => ({ length: body.text.length }),
});
const ping = defineEndpoint({ method: 'GET', path: '/ping', response: z.object({ ok: z.boolean() }), data: () => ({ ok: true }) });
const config = defineConfig({ endpoints: [login, echo, ping] });

const TOKEN = 'control-secret';
/** A PEM-looking key block, assembled at run time so no key-shaped literal sits in the source. */
const keyBlock = (marker: string): string => ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ') + `\n${marker}\n` + ['-----END', 'PRIVATE', 'KEY-----'].join(' ') + '\n';
const silent = createLogger({ level: 'silent' });

let dir: string;
let server: DevServer;
let http: Server | undefined;

const open = (extra: Partial<ServerOptions> = {}): DevServer =>
  (server = createServer(config, { dataDir: dir, logger: silent, controlToken: TOKEN, keepAliveMs: 40, ...extra }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-desktop-'));
});
afterEach(async () => {
  if (http !== undefined) await new Promise((done) => http?.close(done));
  http = undefined;
  rmSync(dir, { recursive: true, force: true });
});

/** Opens the event stream and collects its text. `stop` closes the connection. */
async function stream(base: string, headers: Record<string, string> = { 'x-tempo-token': TOKEN }) {
  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    httpGet(`${base}/__tempo/events`, { headers }, resolve).on('error', reject);
  });
  let text = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (text += chunk));
  return { res, text: () => text, stop: () => res.destroy() };
}

const until = async (check: () => boolean, ms = 3000): Promise<void> => {
  for (let waited = 0; !check(); waited += 10) {
    if (waited > ms) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 10));
  }
};

describe('GET /__tempo/info', () => {
  it('reports what the starter passed in, without a token and without secrets', async () => {
    open({
      info: { project: 'my-app', scheme: 'https', port: 8443, lan: '192.168.1.20', cert: { present: true, notAfter: '2028-01-01T00:00:00.000Z', coversLanIp: true } },
    });
    const res = await request(server.app).get('/__tempo/info');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      service: 'tempo-dev-api',
      project: 'my-app',
      scheme: 'https',
      port: 8443,
      urls: {
        local: 'https://localhost:8443',
        lan: 'https://192.168.1.20:8443',
        androidEmulator: 'https://10.0.2.2:8443',
        iosSimulator: 'https://localhost:8443',
      },
      cert: { present: true, notAfter: '2028-01-01T00:00:00.000Z', coversLanIp: true },
    });
    expect(typeof res.body.version).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.startedAt))).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('leaves the LAN URL out when there is no LAN address', async () => {
    open({ info: { project: 'p', scheme: 'http', port: 9000, cert: { present: false } } });
    const res = await request(server.app).get('/__tempo/info');
    expect(res.body.urls).not.toHaveProperty('lan');
    expect(res.body.cert).toEqual({ present: false });
  });
});

describe('GET /__tempo/ca.pem', () => {
  it('is 404 without a CA file', async () => {
    open();
    expect((await request(server.app).get('/__tempo/ca.pem')).status).toBe(404);
  });

  it('serves the public CA with the PEM content type and no token', async () => {
    const certs = join(dir, 'certs');
    mkdirSync(certs);
    writeFileSync(join(certs, 'rootCA.pem'), '-----BEGIN CERTIFICATE-----\nPUBLIC\n-----END CERTIFICATE-----\n');
    writeFileSync(join(certs, 'key.pem'), keyBlock('LEAKED-LEAF-KEY'));
    writeFileSync(join(certs, 'rootCA-key.pem'), keyBlock('LEAKED-CA-KEY'));
    open();
    const res = await request(server.app).get('/__tempo/ca.pem');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/x-pem-file/);
    expect(res.text).toContain('PUBLIC');
  });

  it('never serves a key file, whatever the request names', async () => {
    const certs = join(dir, 'certs');
    mkdirSync(certs);
    writeFileSync(join(certs, 'key.pem'), keyBlock('LEAKED-LEAF-KEY'));
    writeFileSync(join(certs, 'rootCA-key.pem'), keyBlock('LEAKED-CA-KEY'));
    open();
    for (const path of ['/__tempo/ca.pem', '/__tempo/ca.pem?file=key.pem', '/__tempo/ca.pem/../key.pem', '/__tempo/key.pem', '/__tempo/rootCA-key.pem', '/__tempo/certs/key.pem']) {
      const res = await request(server.app).get(path);
      expect(res.text, path).not.toContain('LEAKED');
      expect(res.status, path).toBeGreaterThanOrEqual(404);
    }
  });

  it('refuses a rootCA.pem that holds a private key block', async () => {
    const certs = join(dir, 'certs');
    mkdirSync(certs);
    writeFileSync(join(certs, 'rootCA.pem'), `-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----\n${keyBlock('LEAKED')}`);
    open();
    const res = await request(server.app).get('/__tempo/ca.pem');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('LEAKED');
  });
});

describe('request log entries', () => {
  it('redacts passwords, tokens and secret query values, and keeps the shape', () => {
    const log = new RequestLog();
    const entry = log.record({
      method: 'POST',
      url: '/auth/login',
      status: 200,
      ms: 4,
      scenario: 'slow',
      reqHeaders: { authorization: 'Bearer hunter2', 'x-tempo-token': 'ctl', accept: 'json' },
      reqBody: { username: 'emilys', password: 'emilyspass', nested: { refreshToken: 'r' } },
      resBody: { accessToken: 'abc', id: 1 },
    });
    const text = JSON.stringify(entry);
    for (const secret of ['hunter2', 'emilyspass', '"abc"', '"ctl"', '"r"']) expect(text).not.toContain(secret);
    expect(entry).toMatchObject({ id: 1, method: 'POST', status: 200, ms: 4, scenario: 'slow' });
    expect(entry.req.headers).toMatchObject({ accept: 'json', authorization: '[REDACTED]' });
    expect(entry.res.body).toEqual({ accessToken: '[REDACTED]', id: 1 });
  });

  it('cuts a big body and marks it truncated', () => {
    const view = viewBody({ text: 'x'.repeat(MAX_BODY_CHARS * 2) });
    expect(view.truncated).toBe(true);
    expect(typeof view.body).toBe('string');
    expect((view.body as string).length).toBe(MAX_BODY_CHARS);
    expect(viewBody({ small: 1 })).toEqual({ body: { small: 1 } });
  });

  it('keeps only the last RING_SIZE entries, oldest dropped, ids still counting up', () => {
    const log = new RequestLog();
    for (let i = 0; i < RING_SIZE + 25; i++) log.record({ method: 'GET', url: `/n/${i}`, status: 200, ms: 1, reqHeaders: {}, reqBody: undefined, resBody: undefined });
    const kept = log.snapshot();
    expect(kept).toHaveLength(RING_SIZE);
    expect(kept[0]?.id).toBe(26);
    expect(kept.at(-1)?.id).toBe(RING_SIZE + 25);
    expect(log.snapshot(RING_SIZE + 20).map((e) => e.id)).toEqual([RING_SIZE + 21, RING_SIZE + 22, RING_SIZE + 23, RING_SIZE + 24, RING_SIZE + 25]);
  });
});

describe('GET /__tempo/events', () => {
  it('needs the control token', async () => {
    open();
    expect((await request(server.app).get('/__tempo/events')).status).toBe(401);
    expect((await request(server.app).get('/__tempo/events').set('x-tempo-token', 'wrong')).status).toBe(401);
  });

  it('sends the buffer first, then live entries, all redacted, with the scenario', async () => {
    open();
    http = await listen(server, { port: 0 });
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    await request(server.app).get('/ping');
    await request(server.app).post('/auth/login?token=qtoken&x=1').send({ username: 'emilys', password: 'emilyspass' });

    const sse = await stream(base);
    expect(sse.res.headers['content-type']).toMatch(/^text\/event-stream/);
    await until(() => sse.text().includes('/auth/login'));
    expect(sse.text()).toContain('"url":"/ping"');

    await request(server.app).post('/auth/login').set('x-tempo-scenario', 'teapot').send({ username: 'a', password: 'secret-pw' });
    await until(() => sse.text().includes('"scenario":"teapot"'));
    const text = sse.text();
    for (const secret of ['emilyspass', 'secret-pw', 'qtoken', 'abc.def.ghi', TOKEN]) expect(text, secret).not.toContain(secret);
    expect(text).toContain('[REDACTED]');
    expect(text).toMatch(/id: 1\nevent: request\ndata: \{/);
    sse.stop();
  });

  it('does not log the control routes themselves', async () => {
    open();
    await request(server.app).get('/__tempo/health');
    await request(server.app).get('/__tempo/info');
    expect(server.requests.snapshot()).toHaveLength(0);
  });

  it('resumes after Last-Event-ID', async () => {
    open();
    http = await listen(server, { port: 0 });
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    for (const n of [1, 2, 3]) await request(server.app).get(`/ping?n=${n}`);
    const sse = await stream(base, { 'x-tempo-token': TOKEN, 'last-event-id': '2' });
    await until(() => sse.text().includes('n=3'));
    expect(sse.text()).not.toContain('n=1');
    expect(sse.text()).not.toContain('n=2');
    sse.stop();
  });

  it('truncates a large request body in the stream', async () => {
    open();
    await request(server.app).post('/echo').send({ text: 'y'.repeat(100_000) });
    const [entry] = server.requests.snapshot();
    expect(entry?.req.truncated).toBe(true);
    expect(JSON.stringify(entry).length).toBeLessThan(MAX_BODY_CHARS * 2 + 2000);
  });

  it('sends keep-alive comments and removes its listener when the client leaves', async () => {
    open();
    http = await listen(server, { port: 0 });
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    expect(server.requests.listenerCount).toBe(0);
    const clients = await Promise.all([stream(base), stream(base), stream(base)]);
    await until(() => server.requests.listenerCount === 3);
    await until(() => clients.every((c) => c.text().includes(': keep-alive')));
    for (const client of clients) client.stop();
    await until(() => server.requests.listenerCount === 0);
    // The keep-alive timer died with the connection: the process has no stray handles from it.
    expect(server.requests.listenerCount).toBe(0);
  });
});

describe('tempo-api dev (injected runner)', () => {
  const ok = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' });
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'tempo-dev-'));
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  function deps(): { deps: DevDeps; calls: string[][]; ups: unknown[]; said: string[] } {
    const calls: string[][] = [];
    const ups: unknown[] = [];
    const said: string[] = [];
    const caRoot = join(work, 'ca');
    mkdirSync(caRoot, { recursive: true });
    writeFileSync(join(caRoot, 'rootCA.pem'), 'PUBLIC CA');
    const run: Runner = (command, args) => {
      calls.push([command, ...args]);
      const keyAt = args.indexOf('-key-file');
      if (keyAt !== -1) writeFileSync(args[keyAt + 1] ?? '', 'KEY');
      const certAt = args.indexOf('-cert-file');
      if (certAt !== -1) writeFileSync(args[certAt + 1] ?? '', 'CERT');
      return args[0] === '-CAROOT' ? ok(`${caRoot}\n`) : ok();
    };
    return {
      deps: { run, say: (line = '') => void said.push(line), lan: () => '192.168.1.9', up: (o) => (ups.push(o), Promise.resolve()) },
      calls,
      ups,
      said,
    };
  }

  it('ios: creates missing certs, trusts the booted simulator, then runs up', async () => {
    const d = deps();
    const paths = resolvePaths(join(work, 'project'), undefined);
    await runDev({ platform: 'ios', paths, port: '8555', host: '0.0.0.0', http: false }, d.deps);
    const commands = d.calls.map((c) => c.slice(0, 2).join(' '));
    expect(commands).toContain('mkcert -cert-file');
    expect(d.calls.some((c) => c[0] === 'xcrun' && c.includes('add-root-cert') && c.includes('booted'))).toBe(true);
    expect(d.calls.flat()).not.toContain('-install');
    expect(d.calls.some((c) => c[0] === 'adb')).toBe(false);
    expect(d.ups).toEqual([{ cwd: paths.cwd, config: undefined, port: '8555', host: '0.0.0.0', http: false }]);
  });

  it('android: pushes the CA (push only), prints the steps, then runs up; reuses existing certs', async () => {
    const d = deps();
    const paths = resolvePaths(join(work, 'project'), undefined);
    mkdirSync(paths.certsDir, { recursive: true });
    writeFileSync(join(paths.certsDir, 'cert.pem'), 'C');
    writeFileSync(join(paths.certsDir, 'key.pem'), 'K');
    await runDev({ platform: 'android', paths, host: '0.0.0.0', http: false }, d.deps);
    expect(d.calls.some((c) => c[0] === 'mkcert' && c.includes('-cert-file'))).toBe(false);
    expect(d.calls.some((c) => c[0] === 'adb' && c.includes('push'))).toBe(true);
    expect(d.said.join('\n')).toContain('Install a certificate');
    expect(d.ups).toHaveLength(1);
  });

  it('--http skips certificates and trust entirely', async () => {
    const d = deps();
    const paths = resolvePaths(join(work, 'project'), undefined);
    await runDev({ platform: 'ios', paths, host: '127.0.0.1', http: true }, d.deps);
    expect(d.calls).toEqual([]);
    expect(d.ups).toHaveLength(1);
  });

  it('does not start the server when trust fails', async () => {
    const d = deps();
    const failing: DevDeps = {
      ...d.deps,
      run: (command, args, options) => (command === 'xcrun' ? { status: 1, stdout: '', stderr: 'No devices are booted.' } : d.deps.run(command, args, options)),
    };
    const paths = resolvePaths(join(work, 'project'), undefined);
    await expect(runDev({ platform: 'ios', paths, host: '0.0.0.0', http: false }, failing)).rejects.toThrow(/booted/);
    expect(d.ups).toHaveLength(0);
  });
});
