import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { generateFromSchema, MAX_GENERATED_LENGTH } from '../src/import/generate.ts';
import { importApiText } from '../src/import/openapi.ts';

import { json, serve, stopAll } from './helpers.ts';
import { fixture } from './import-helpers.ts';
import { startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

describe('AC-LP-5 generation limits', () => {
  it('AC-LP-5 never makes more than 3 items, whatever minItems asks for', () => {
    const notes: string[] = [];
    const value = generateFromSchema({ type: 'array', minItems: 1_000_000_000, items: { type: 'integer' } }, 'a|200', notes) as unknown[];
    expect(value.length).toBeGreaterThanOrEqual(1);
    expect(value.length).toBeLessThanOrEqual(3);
    expect(notes[0]).toContain('cut');
    const maybeEmpty = generateFromSchema({ type: 'array', minItems: 0, maxItems: 1e12, items: { type: 'integer' } }, 'b|200') as unknown[];
    expect(maybeEmpty.length).toBeLessThanOrEqual(3);
    expect(generateFromSchema({ type: 'array', maxItems: 0, items: { type: 'integer' } }, 'c|200')).toEqual([]);
  });

  it('AC-LP-5 cuts a huge minLength or maxLength and says so, without looping', () => {
    const notes: string[] = [];
    const started = Date.now();
    const text = generateFromSchema({ type: 'string', minLength: 4_000_000_000 }, 'a|200', notes) as string;
    expect(text.length).toBeLessThanOrEqual(MAX_GENERATED_LENGTH);
    expect((generateFromSchema({ type: 'string', maxLength: 1e15 }, 'b|200') as string).length).toBeLessThanOrEqual(MAX_GENERATED_LENGTH);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(notes).toHaveLength(1);
  });

  it('AC-LP-5 stops a schema that nests wide and deep after a fixed number of nodes', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 6; i += 1) schema = { type: 'object', properties: Object.fromEntries(Array.from({ length: 40 }, (_unused, n) => [`p${String(n)}`, schema])) };
    const started = Date.now();
    generateFromSchema(schema, 'big|200');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('AC-LP-5 reports the cut as a warning of the import', () => {
    const doc = { openapi: '3.0.3', info: { title: 'x', version: '1' }, paths: { '/x': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', minItems: 99999999, items: { type: 'string' } } } } } } } } } };
    expect(importApiText(JSON.stringify(doc), 'x.json').warnings.join('\n')).toContain('cut to at most 3 items');
  });
});

describe('AC-LP-5 patterns from a file never run', () => {
  const doc = {
    openapi: '3.0.3',
    info: { title: 'Evil', version: '1' },
    paths: {
      '/echo': {
        post: {
          operationId: 'echo',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string', pattern: '^(a+)+$' } }, patternProperties: { '^(x+)+$': { type: 'string' } } } } } },
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } },
        },
      },
    },
  };

  it('AC-LP-5 removes pattern and patternProperties from imported schemas and lists them', () => {
    const api = importApiText(JSON.stringify(doc), 'evil.json');
    expect(JSON.stringify(api.endpoints)).not.toContain('(a+)+');
    expect(JSON.stringify(api.endpoints)).not.toContain('patternProperties');
    expect(api.warnings.join('\n')).toContain('"^(a+)+$"');
  });

  it('AC-LP-5 also ignores a pattern written by hand in backend.json, so a crafted value cannot freeze the server', async () => {
    const { url } = await serve({
      name: 'hand',
      endpoints: [{ id: 'echo', type: 'static', method: 'POST', path: '/echo', body: { ok: true }, request: { body: { type: 'object', properties: { name: { type: 'string', pattern: '^(a+)+$' } } } } }],
    });
    const started = Date.now();
    const answer = await fetch(`${url}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${'a'.repeat(40)}!` }) });
    expect(answer.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('AC-LP-5 refuses a string longer than 10 000 characters in the body, the query or the path', async () => {
    const { url } = await serve({
      name: 'long',
      endpoints: [
        { id: 'echo', type: 'static', method: 'POST', path: '/echo/:id', body: { ok: true }, request: { body: { type: 'object', properties: { name: { type: 'string' } } }, query: { type: 'object', properties: { q: { type: 'string' } } } } },
      ],
    });
    const post = (query: string, body: unknown): Promise<Response> => fetch(`${url}/echo/1${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('', { name: 'x'.repeat(20_000) })).status).toBe(400);
    expect((await post(`?q=${'y'.repeat(10_500)}`, {})).status).toBe(400);
    expect((await post('', { name: 'fine' })).status).toBe(200);
  });
});

describe('AC-LP-5 import addresses never reach the audit log or the logs', () => {
  it('AC-LP-5 keeps only origin and path of the address in the audit entry, the import record and the logs', async () => {
    const files = createServer((_req, res) => void res.writeHead(200).end(fixture('petstore-swagger2.json')));
    await new Promise<void>((done) => files.listen(0, '127.0.0.1', done));
    try {
      const base = `http://127.0.0.1:${String((files.address() as AddressInfo).port)}`;
      const site = await startSite({ allowPrivateImportUrls: true });
      const secretUrl = `${base}/api.json?token=SECRETQUERY#frag-SECRETFRAG`;
      const preview = await site.owner.admin('demo', 'POST', '/import/preview', { url: secretUrl });
      expect(preview.status, preview.body).toBe(200);
      expect((preview.json() as { source: string }).source).toBe(`${base}/api.json`);
      const applied = await site.owner.admin('demo', 'POST', '/import/apply', { url: secretUrl });
      expect(applied.status, applied.body).toBe(200);
      // A refused address with a user name and password is audited without them as well.
      const refused = await site.owner.admin('demo', 'POST', '/import/preview', { url: `https://admin:HUNTER2PW@127.0.0.1:${base.split(':')[2] ?? ''}/api.json?token=SECRETQUERY` });
      expect(refused.status).toBe(400);
      expect(refused.body).not.toContain('HUNTER2PW');
      const audit = JSON.stringify(site.team.audit.query({ limit: 500 }).entries);
      for (const secret of ['SECRETQUERY', 'SECRETFRAG', 'HUNTER2PW']) expect(audit, secret).not.toContain(secret);
      expect(audit).toContain(`${base}/api.json`);
      const stored = JSON.stringify((await site.owner.admin('demo', 'GET', '/definition')).json());
      for (const secret of ['SECRETQUERY', 'SECRETFRAG', 'HUNTER2PW']) expect(stored, secret).not.toContain(secret);
      // And nothing in the engine's own log files.
      const backendDir = join(site.dir, 'backends', 'demo', '.data', 'logs');
      for (const name of readdirSync(backendDir)) {
        const text = readFileSync(join(backendDir, name), 'utf8');
        for (const secret of ['SECRETQUERY', 'SECRETFRAG', 'HUNTER2PW']) expect(text, `${name} ${secret}`).not.toContain(secret);
      }
    } finally {
      await new Promise<void>((done) => files.close(() => done()));
    }
  });

  it('AC-LP-5 reports a bad address by name only, never by echoing it', async () => {
    const { backend } = await serve({ name: 'x' });
    const admin = `http://127.0.0.1:${String(backend.admin.port)}/__admin/import/preview`;
    const answer = await fetch(admin, { method: 'POST', headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ url: 'ftp://u:SECRETPW@host/x?token=SECRETQ' }) });
    expect(answer.status).toBe(400);
    const text = JSON.stringify(await json(answer));
    expect(text).not.toContain('SECRETPW');
    expect(text).not.toContain('SECRETQ');
  });
});
