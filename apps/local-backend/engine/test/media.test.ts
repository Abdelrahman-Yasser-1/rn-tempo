import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { contentDisposition, detectMime, parseRange, sanitizeMime, sanitizeName, sniffMime } from '../src/media.ts';
import type { BackendInput } from '../src/schema.ts';
import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const definition = (maxBytes?: number): BackendInput => ({
  name: 'media',
  ...(maxBytes === undefined ? {} : { media: { maxBytes } }),
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  collections: [{ name: 'posts', fields: [{ name: 'title', type: 'string' }, { name: 'cover', type: 'media' }] }],
  endpoints: [
    { id: 'upload', type: 'upload', method: 'POST', path: '/media' },
    { id: 'uploadMany', type: 'upload', method: 'POST', path: '/media/many', multiple: true },
    { id: 'uploadAuth', type: 'upload', method: 'POST', path: '/media/mine', auth: 'bearer' },
    { id: 'download', type: 'download', method: 'GET', path: '/media/:id' },
    { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    { id: 'postsAdd', type: 'crud', collection: 'posts', action: 'create', method: 'POST', path: '/posts' },
    { id: 'postsGet', type: 'crud', collection: 'posts', action: 'get', method: 'GET', path: '/posts/:id', media: 'object' },
    { id: 'postsGetUrl', type: 'crud', collection: 'posts', action: 'get', method: 'GET', path: '/posts-url/:id', media: 'url' },
    { id: 'postsGetId', type: 'crud', collection: 'posts', action: 'get', method: 'GET', path: '/posts-id/:id' },
  ],
});

// ---- fixtures: the head of each format followed by filler, so files span several chunks
const filler = (n: number): Buffer => randomBytes(n);
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), filler(200_000)]);
const FIXTURES: Record<string, { name: string; bytes: Buffer; mime: string; inline: boolean }> = {
  png: { name: 'pic.png', bytes: png, mime: 'image/png', inline: true },
  jpeg: { name: 'pic.jpg', bytes: Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), filler(70_000)]), mime: 'image/jpeg', inline: true },
  gif: { name: 'a.gif', bytes: Buffer.concat([Buffer.from('GIF89a'), filler(5000)]), mime: 'image/gif', inline: true },
  webp: { name: 'a.webp', bytes: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), filler(4000)]), mime: 'image/webp', inline: true },
  mp4: { name: 'v.mp4', bytes: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), filler(300_000)]), mime: 'video/mp4', inline: true },
  webm: { name: 'v.webm', bytes: Buffer.concat([Buffer.from('1a45dfa3', 'hex'), filler(50_000)]), mime: 'video/webm', inline: true },
  mp3: { name: 's.mp3', bytes: Buffer.concat([Buffer.from('ID3'), filler(20_000)]), mime: 'audio/mpeg', inline: true },
  wav: { name: 's.wav', bytes: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WAVEfmt '), filler(9000)]), mime: 'audio/wav', inline: true },
  ogg: { name: 's.ogg', bytes: Buffer.concat([Buffer.from('OggS'), filler(9000)]), mime: 'audio/ogg', inline: true },
  pdf: { name: 'doc.pdf', bytes: Buffer.concat([Buffer.from('%PDF-1.7\n'), filler(150_000)]), mime: 'application/pdf', inline: false },
  zip: { name: 'a.zip', bytes: Buffer.concat([Buffer.from('504b0304', 'hex'), filler(80_000)]), mime: 'application/zip', inline: false },
  json: { name: 'data.json', bytes: Buffer.from(JSON.stringify({ a: [1, 2, 3], b: 'x' })), mime: 'application/json', inline: false },
  text: { name: 'notes.txt', bytes: Buffer.from('Hello, wörld\nline two\n'), mime: 'text/plain', inline: false },
  svg: { name: 'logo.svg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), mime: 'image/svg+xml', inline: false },
  html: { name: 'page.html', bytes: Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>'), mime: 'text/html', inline: false },
  binary: { name: 'blob.bin', bytes: Buffer.concat([Buffer.from([0, 1, 2, 3, 0xfe, 0xfd]), filler(3000)]), mime: 'application/octet-stream', inline: false },
};

const uploadForm = (url: string, name: string, bytes: Buffer, type?: string, headers: Record<string, string> = {}): Promise<Response> => {
  const form = new FormData();
  form.append('file', new Blob([bytes], type === undefined ? {} : { type }), name);
  return fetch(url, { method: 'POST', body: form, headers });
};

interface Uploaded {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
}

describe('type detection and helpers', () => {
  it('detects by magic bytes before the declared type', () => {
    for (const [key, fixture] of Object.entries(FIXTURES)) {
      if (key === 'json' || key === 'text' || key === 'binary') continue;
      expect(sniffMime(fixture.bytes.subarray(0, 8192)), key).toBe(fixture.mime);
    }
    const lying = FIXTURES.png as { bytes: Buffer };
    expect(detectMime(lying.bytes.subarray(0, 8192), 'application/pdf', lying.bytes.length, () => lying.bytes)).toBe('image/png');
  });

  it('falls back to a sanitized declared type, then text/plain, then octet-stream', () => {
    const text = Buffer.from('a,b\n1,2\n');
    expect(detectMime(text, 'Text/CSV; charset=utf-8', text.length, () => text)).toBe('text/csv');
    expect(detectMime(text, undefined, text.length, () => text)).toBe('text/plain');
    expect(detectMime(text, 'not a type<script>', text.length, () => text)).toBe('text/plain');
    const bin = Buffer.from([0, 0xff, 0x10]);
    expect(detectMime(bin, undefined, 3, () => bin)).toBe('application/octet-stream');
    expect(detectMime(bin, 'application/x-custom', 3, () => bin)).toBe('application/x-custom');
    expect(sanitizeMime('text/html\r\nx-evil: 1')).toBeUndefined();
  });

  it('keeps names as metadata only: no folders, no control characters', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeName('C:\\Users\\me\\a.txt')).toBe('a.txt');
    expect(sanitizeName('..\u0000\n')).toBe('file');
    expect(sanitizeName(undefined)).toBe('file');
    expect(sanitizeName('x'.repeat(400))).toHaveLength(255);
  });

  it('builds a safe Content-Disposition', () => {
    const header = contentDisposition('na"me;é.png', 'image/png');
    expect(header).toBe(`inline; filename="na_me__.png"; filename*=UTF-8''na%22me%3B%C3%A9.png`);
    expect(contentDisposition('line\r\nbreak.png', 'image/png')).not.toMatch(/[\r\n]/);
    expect(contentDisposition('a.svg', 'image/svg+xml')).toMatch(/^attachment/);
    expect(contentDisposition('a.pdf', 'application/pdf')).toMatch(/^attachment/);
  });

  it('parses one range, and says unsatisfiable or ignore', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=50-5000', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1,5-6', 100)).toBe('ignore');
    expect(parseRange('items=0-1', 100)).toBe('ignore');
    expect(parseRange(undefined, 100)).toBe('ignore');
  });
});

describe('AC-LB-4 upload then download returns identical bytes with the right type', () => {
  for (const [key, fixture] of Object.entries(FIXTURES)) {
    it(`round-trips ${key} (multipart)`, async () => {
      const { url } = await serve(definition());
      const sent = await uploadForm(`${url}/media`, fixture.name, fixture.bytes, 'application/octet-stream');
      expect(sent.status).toBe(201);
      const file = (await sent.json()) as Uploaded;
      expect(file).toMatchObject({ name: fixture.name, mime: fixture.mime, size: fixture.bytes.length });
      expect(file.id).toMatch(/^[0-9a-f]{32}$/);
      expect(file.url).toBe(`${url}/media/${file.id}`);
      const got = await fetch(file.url);
      expect(got.status).toBe(200);
      expect(Buffer.from(await got.arrayBuffer()).equals(fixture.bytes)).toBe(true);
      expect(got.headers.get('content-type')).toBe(fixture.mime);
      expect(got.headers.get('content-length')).toBe(String(fixture.bytes.length));
      expect(got.headers.get('accept-ranges')).toBe('bytes');
      expect(got.headers.get('etag')).toMatch(/^"[0-9a-f]{32}"$/);
      expect(got.headers.get('x-content-type-options')).toBe('nosniff');
      expect(got.headers.get('content-disposition')).toMatch(fixture.inline ? /^inline;/ : /^attachment;/);
    });
  }

  it('round-trips a raw body whose Content-Type is the file type', async () => {
    const { url } = await serve(definition());
    const bytes = FIXTURES.pdf?.bytes ?? Buffer.alloc(0);
    const sent = await fetch(`${url}/media?name=report.pdf`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: bytes });
    expect(sent.status).toBe(201);
    const file = (await sent.json()) as Uploaded;
    expect(file).toMatchObject({ name: 'report.pdf', mime: 'application/pdf', size: bytes.length });
    expect(Buffer.from(await (await fetch(file.url)).arrayBuffer()).equals(bytes)).toBe(true);
  });

  it('stores an empty file', async () => {
    const { url } = await serve(definition());
    const file = (await (await uploadForm(`${url}/media`, 'empty.txt', Buffer.alloc(0), 'text/plain')).json()) as Uploaded;
    expect(file.size).toBe(0);
    const got = await fetch(file.url);
    expect(got.status).toBe(200);
    expect((await got.arrayBuffer()).byteLength).toBe(0);
  });

  it('accepts several files only on a `multiple` endpoint', async () => {
    const { url } = await serve(definition());
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('one')]), 'one.txt');
    form.append('file', new Blob([Buffer.from('two')]), 'two.txt');
    const many = await fetch(`${url}/media/many`, { method: 'POST', body: form });
    expect(many.status).toBe(201);
    const files = ((await many.json()) as { files: Uploaded[] }).files;
    expect(files.map((file) => file.name)).toEqual(['one.txt', 'two.txt']);
    const single = new FormData();
    single.append('file', new Blob(['one']), 'one.txt');
    single.append('file', new Blob(['two']), 'two.txt');
    expect((await fetch(`${url}/media`, { method: 'POST', body: single })).status).toBe(400);
  });

  it('answers 400 when no file is sent', async () => {
    const { url } = await serve(definition());
    const form = new FormData();
    form.append('other', 'x');
    expect((await fetch(`${url}/media`, { method: 'POST', body: form })).status).toBe(400);
  });
});

describe('AC-LB-4 size limit: 413, enforced while streaming, temp file cleaned', () => {
  /** Sends a chunked (no Content-Length) request and returns what the server answered. */
  function sendChunked(port: number, path: string, headers: Record<string, string>, chunks: Buffer[]): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: { ...headers, 'transfer-encoding': 'chunked' } }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      (async (): Promise<void> => {
        for (const chunk of chunks) {
          if (!req.write(chunk)) await new Promise((done) => req.once('drain', done));
          await new Promise((done) => setTimeout(done, 5));
        }
        req.end();
      })().catch(reject);
    });
  }

  it('rejects an oversized raw upload mid-stream and leaves no temp file or record', async () => {
    const { backend, dir } = await serve(definition(1000));
    const answer = await sendChunked(backend.port, '/media', { 'content-type': 'application/octet-stream' }, Array.from({ length: 8 }, () => Buffer.alloc(400, 1)));
    expect(answer.status).toBe(413);
    expect(JSON.parse(answer.body)).toMatchObject({ status: 413 });
    expect(backend.engine.media.tempFiles()).toEqual([]);
    expect(backend.engine.media.usage()).toEqual({ files: 0, bytes: 0 });
    expect(readdirSync(join(dir, '.data/media')).filter((name) => name !== '.tmp')).toEqual([]);
  });

  it('rejects an oversized multipart file mid-stream the same way', async () => {
    const { backend } = await serve(definition(1000));
    const boundary = '----tempotest';
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const answer = await sendChunked(backend.port, '/media', { 'content-type': `multipart/form-data; boundary=${boundary}` }, [head, ...Array.from({ length: 8 }, () => Buffer.alloc(400, 2)), tail]);
    expect(answer.status).toBe(413);
    expect(backend.engine.media.tempFiles()).toEqual([]);
    expect(backend.engine.media.usage().files).toBe(0);
  });

  it('refuses a declared Content-Length over the limit before reading anything', async () => {
    const { url, backend } = await serve(definition(1000));
    const response = await fetch(`${url}/media`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(5000) });
    expect(response.status).toBe(413);
    expect(backend.engine.media.usage().files).toBe(0);
  });

  it('accepts a file exactly at the limit, and the endpoint maxBytes beats the global one', async () => {
    const { url } = await serve({ ...definition(100_000), endpoints: [{ id: 'small', type: 'upload', method: 'POST', path: '/small', maxBytes: 10 }, { id: 'any', type: 'upload', method: 'POST', path: '/any' }] });
    expect((await uploadForm(`${url}/any`, 'ok.bin', Buffer.alloc(100_000, 3), 'application/octet-stream')).status).toBe(201);
    expect((await uploadForm(`${url}/any`, 'big.bin', Buffer.alloc(100_001, 3), 'application/octet-stream')).status).toBe(413);
    expect((await uploadForm(`${url}/small`, 'x.bin', Buffer.alloc(11), 'application/octet-stream')).status).toBe(413);
  });

  it('keeps serving after a rejected upload', async () => {
    const { url } = await serve(definition(1000));
    expect((await uploadForm(`${url}/media`, 'big.bin', Buffer.alloc(5000), 'application/octet-stream')).status).toBe(413);
    expect((await uploadForm(`${url}/media`, 'ok.bin', Buffer.alloc(500), 'application/octet-stream')).status).toBe(201);
  });
});

describe('download: ranges, caching and safe serving', () => {
  const upload = async (url: string, key: keyof typeof FIXTURES): Promise<Uploaded & { bytes: Buffer }> => {
    const fixture = FIXTURES[key] as (typeof FIXTURES)[string];
    return { ...((await (await uploadForm(`${url}/media`, fixture.name, fixture.bytes, 'application/octet-stream')).json()) as Uploaded), bytes: fixture.bytes };
  };

  it('answers a single Range with 206 and the right bytes', async () => {
    const { url } = await serve(definition());
    const file = await upload(url, 'mp4');
    const total = file.bytes.length;
    const part = await fetch(file.url, { headers: { range: 'bytes=10-19' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 10-19/${total}`);
    expect(part.headers.get('content-length')).toBe('10');
    expect(Buffer.from(await part.arrayBuffer()).equals(file.bytes.subarray(10, 20))).toBe(true);
    const tail = await fetch(file.url, { headers: { range: 'bytes=-100' } });
    expect(tail.status).toBe(206);
    expect(Buffer.from(await tail.arrayBuffer()).equals(file.bytes.subarray(total - 100))).toBe(true);
    const open = await fetch(file.url, { headers: { range: `bytes=${total - 5}-` } });
    expect(Buffer.from(await open.arrayBuffer()).equals(file.bytes.subarray(total - 5))).toBe(true);
  });

  it('answers an unsatisfiable Range with 416 and Content-Range */size; several ranges get the whole file', async () => {
    const { url } = await serve(definition());
    const file = await upload(url, 'gif');
    const bad = await fetch(file.url, { headers: { range: `bytes=${file.bytes.length}-` } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get('content-range')).toBe(`bytes */${file.bytes.length}`);
    const many = await fetch(file.url, { headers: { range: 'bytes=0-1,4-5' } });
    expect(many.status).toBe(200);
    expect((await many.arrayBuffer()).byteLength).toBe(file.bytes.length);
  });

  it('supports HEAD and If-None-Match (304)', async () => {
    const { url } = await serve(definition());
    const file = await upload(url, 'png');
    const head = await fetch(file.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(file.bytes.length));
    const etag = head.headers.get('etag') ?? '';
    const again = await fetch(file.url, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
    expect((await again.arrayBuffer()).byteLength).toBe(0);
  });

  it('serves SVG and HTML as attachments with nosniff, never inline', async () => {
    const { url } = await serve(definition());
    for (const key of ['svg', 'html'] as const) {
      const file = await upload(url, key);
      const got = await fetch(file.url);
      expect(got.headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(got.headers.get('x-content-type-options')).toBe('nosniff');
      expect(got.headers.get('content-security-policy')).toContain('sandbox');
    }
  });

  it('is harmless with traversal-like names: the name is metadata, the path never comes from it', async () => {
    const { url, dir } = await serve(definition());
    const names = ['../../etc/passwd', '..\\..\\windows\\system.ini', '/etc/shadow', 'a/../../b.txt', 'x\r\nset-cookie: a=b', '%2e%2e%2fsecret'];
    for (const name of names) {
      const sent = await uploadForm(`${url}/media`, name, Buffer.from('payload'), 'text/plain');
      expect(sent.status, name).toBe(201);
      const file = (await sent.json()) as Uploaded;
      expect(file.name).not.toMatch(/[\\/\r\n]/);
      const got = await fetch(file.url);
      expect(await got.text()).toBe('payload');
      expect(got.headers.get('content-disposition')).not.toMatch(/[\r\n]/);
      expect(got.headers.get('set-cookie')).toBeNull();
      expect(existsSync(join(dir, '.data/media', file.id.slice(0, 2), file.id))).toBe(true);
    }
    // Every stored file is directly under a two-character shard of .data/media, and nothing leaked above it.
    const shards = readdirSync(join(dir, '.data/media')).filter((name) => name !== '.tmp');
    expect(shards.every((name) => /^[0-9a-f]{2}$/.test(name))).toBe(true);
    expect(existsSync(join(dir, '..', 'passwd'))).toBe(false);
    expect(existsSync(join(dir, 'etc'))).toBe(false);
    expect(statSync(join(dir, '.data/media')).mode & 0o777).toBe(0o700);
  });

  it('answers 404 for an id that is not a media id, however it is spelled', async () => {
    const { url } = await serve(definition());
    for (const id of ['nope', '..%2f..%2fetc%2fpasswd', '%2e%2e', 'a'.repeat(32), '0'.repeat(31), 'G'.repeat(32), '0'.repeat(33)]) {
      expect((await fetch(`${url}/media/${id}`)).status, id).toBe(404);
    }
  });
});

describe('collections: the media field type', () => {
  it('stores ids, checks they exist, and expands to a URL or an object on request', async () => {
    const { url } = await serve(definition());
    const file = (await (await uploadForm(`${url}/media`, 'cover.png', FIXTURES.png?.bytes ?? Buffer.alloc(0), 'image/png')).json()) as Uploaded;
    const post = (body: unknown): Promise<Response> => fetch(`${url}/posts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ title: 'a', cover: 'f'.repeat(32) })).status).toBe(400);
    const created = await post({ title: 'a', cover: file.id });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { cover: string }).cover).toBe(file.id); // the create endpoint keeps the id
    expect((await json(await fetch(`${url}/posts-id/1`))).cover).toBe(file.id);
    expect((await json(await fetch(`${url}/posts-url/1`))).cover).toBe(`${url}/media/${file.id}`);
    expect((await json(await fetch(`${url}/posts/1`))).cover).toEqual({ id: file.id, url: `${url}/media/${file.id}`, name: 'cover.png', mime: 'image/png', size: file.size });
  });
});

describe('uploadedBy', () => {
  it('records the signed-in user on a bearer upload endpoint', async () => {
    const { url, backend } = await serve(definition());
    const login = (await (await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) })).json()) as { id: number; accessToken: string };
    expect((await uploadForm(`${url}/media/mine`, 'a.txt', Buffer.from('x'))).status).toBe(401);
    const sent = await uploadForm(`${url}/media/mine`, 'a.txt', Buffer.from('x'), 'text/plain', { authorization: `Bearer ${login.accessToken}` });
    expect(sent.status).toBe(201);
    const file = (await sent.json()) as Uploaded;
    expect(backend.engine.media.get(file.id)?.uploadedBy).toBe(login.id);
  });
});

describe('admin media routes', () => {
  it('lists with paging and a type filter, uploads, gets, previews, reports storage and deletes the file', async () => {
    const { backend, dir } = await serve(definition());
    const admin = (method: string, path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(`http://127.0.0.1:${backend.admin.port}/__admin${path}`, { method, ...init, headers: { authorization: `Bearer ${backend.admin.token}`, ...(init.headers ?? {}) } });
    const form = (name: string, bytes: Buffer, type: string): FormData => {
      const data = new FormData();
      data.append('file', new Blob([bytes], { type }), name);
      return data;
    };
    const png = FIXTURES.png as (typeof FIXTURES)[string];
    const pdf = FIXTURES.pdf as (typeof FIXTURES)[string];
    const a = (await (await admin('POST', '/media', { body: form(png.name, png.bytes, 'image/png') })).json()) as Uploaded;
    const b = (await (await admin('POST', '/media', { body: form(pdf.name, pdf.bytes, 'application/pdf') })).json()) as Uploaded;
    expect(a.mime).toBe('image/png');
    const all = await json(await admin('GET', '/media'));
    expect(all.total).toBe(2);
    expect(((await json(await admin('GET', '/media?type=image'))).items as Uploaded[]).map((item) => item.id)).toEqual([a.id]);
    expect(((await json(await admin('GET', '/media?type=application/pdf'))).items as unknown[]).length).toBe(1);
    expect(((await json(await admin('GET', '/media?limit=1&skip=1'))).items as unknown[]).length).toBe(1);
    expect(await json(await admin('GET', `/media/${a.id}`))).toMatchObject({ id: a.id, originalName: png.name, mime: 'image/png', size: png.bytes.length });
    expect(await json(await admin('GET', '/media/usage'))).toMatchObject({ files: 2, bytes: png.bytes.length + pdf.bytes.length });
    const file = await admin('GET', `/media/${b.id}/file`);
    expect(Buffer.from(await file.arrayBuffer()).equals(pdf.bytes)).toBe(true);
    const path = join(dir, '.data/media', a.id.slice(0, 2), a.id);
    expect(readFileSync(path).equals(png.bytes)).toBe(true);
    expect((await admin('DELETE', `/media/${a.id}`)).status).toBe(200);
    expect(existsSync(path)).toBe(false);
    expect((await admin('GET', `/media/${a.id}`)).status).toBe(404);
    expect((await admin('DELETE', `/media/${a.id}`)).status).toBe(404);
    expect(await json(await admin('GET', '/media/usage'))).toMatchObject({ files: 1 });
  });

  it('admin media routes are not on the public port', async () => {
    const { url } = await serve(definition());
    for (const path of ['/__admin/media', '/__admin/media/usage']) expect((await fetch(`${url}${path}`)).status).toBe(404);
  });
});
