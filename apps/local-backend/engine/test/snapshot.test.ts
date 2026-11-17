import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { crc32, deflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { startBackend, type RunningBackend } from '../src/app.ts';
import { createBackend } from '../src/folder.ts';
import { exportSnapshot, importSnapshot, SNAPSHOT_EXCLUDED } from '../src/snapshot.ts';

import { tempDir } from './helpers.ts';

const started: RunningBackend[] = [];
afterEach(async () => {
  await Promise.all(started.splice(0).map((backend) => backend.stop()));
});

async function open(dir: string): Promise<{ url: string; backend: RunningBackend }> {
  const backend = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, watch: false });
  started.push(backend);
  return { url: `http://127.0.0.1:${backend.port}`, backend };
}
const send = (url: string, method = 'GET', body?: unknown, token?: string): Promise<Response> =>
  fetch(url, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// ---- a tiny zip maker for hostile archives

interface Item {
  name: string;
  data?: Buffer;
  method?: 0 | 8;
  /** The size written in the directory when it should lie. */
  declared?: number;
  unixMode?: number;
}

function makeZip(items: Item[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const item of items) {
    const data = item.data ?? Buffer.alloc(0);
    const method = item.method ?? 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const name = Buffer.from(item.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(item.declared ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(0x031e, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(crc32(data), 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(item.declared ?? data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(((item.unixMode ?? 0o100644) << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, name]));
    parts.push(local, name, body);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

/** A valid snapshot's contents as items (a manifest that matches), for tests that break one thing. */
function validItems(extra: Item[] = [], tweak: (manifest: Record<string, unknown>) => void = () => undefined): Item[] {
  const files: Item[] = [{ name: 'backend.json', data: Buffer.from(JSON.stringify({ name: 'x' })) }, ...extra];
  const manifest: Record<string, unknown> = {
    format: 1,
    engineVersion: '0.0.0',
    createdAt: new Date().toISOString(),
    backend: 'x',
    counts: { collections: 0, endpoints: 0, users: 0, mediaFiles: 0, handlers: 0, seedFiles: 0, rows: {} },
    excluded: [...SNAPSHOT_EXCLUDED],
    note: 'test',
    files: files.map((file) => ({ path: file.name, size: (file.data ?? Buffer.alloc(0)).length, sha256: sha(file.data ?? Buffer.alloc(0)) })),
  };
  tweak(manifest);
  return [...files, { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }];
}

function archive(items: Item[]): string {
  const file = join(tempDir(), 'hostile.zip');
  writeFileSync(file, makeZip(items));
  return file;
}

const target = (): string => join(tempDir(), 'restored');

// ---- the round trip

/** Creates the preset, serves it, adds data and media, and returns the stopped folder. */
async function populated(): Promise<{ dir: string; pdf: Uint8Array; mediaId: string }> {
  const dir = join(tempDir(), 'source');
  createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
  const { url, backend } = await open(dir);
  expect((await send(`${url}/products/add`, 'POST', { title: 'Snapshot lamp', price: 12.5 })).status).toBe(201);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 255]);
  const form = new FormData();
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'doc.pdf');
  const uploaded = (await (await fetch(`${url}/media/upload`, { method: 'POST', body: form })).json()) as { id: string };
  const login = (await (await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' })).json()) as { refreshToken: string };
  expect(login.refreshToken.length).toBeGreaterThan(8);
  await backend.stop();
  started.splice(0);
  return { dir, pdf, mediaId: uploaded.id };
}

describe('snapshot export and import (AC-LB-9)', () => {
  it('round-trips definitions, data, media and handlers into a new folder', async () => {
    const { dir, pdf, mediaId } = await populated();
    const zip = join(tempDir(), 'backend.zip');
    await exportSnapshot({ dir }, zip);
    if (spawnSync('unzip', ['-v']).status === 0) expect(spawnSync('unzip', ['-t', zip], { encoding: 'utf8' }).status).toBe(0); // an independent reader accepts it
    const restored = target();
    const result = await importSnapshot(zip, restored);

    const manifest = result.manifest;
    expect(manifest).toMatchObject({ format: 1, backend: 'Tempo template', excluded: ['secrets.json', 'certs/'], counts: { collections: 1, endpoints: 16, users: 1, mediaFiles: 1, handlers: 1, seedFiles: 1, rows: { products: 101 } } });
    expect(manifest.note).toMatch(/new JWT secret/);
    const names = manifest.files.map((file) => file.path);
    expect(names).toEqual(expect.arrayContaining(['backend.json', 'handlers/stats-summary.js', 'seed/products.json', 'data/db.sqlite', `media/${mediaId.slice(0, 2)}/${mediaId}`]));
    expect(names.some((name) => name.includes('secrets') || name.includes('certs'))).toBe(false);
    for (const name of ['backend.json', 'handlers/stats-summary.js', 'seed/products.json']) expect(readFileSync(join(restored, name), 'utf8')).toBe(readFileSync(join(dir, name), 'utf8'));
    expect(readFileSync(join(restored, '.data/.gitignore'), 'utf8')).toBe('*\n');
    expect(existsSync(join(restored, '.data/secrets.json'))).toBe(false); // a new one is made when it is served
    expect(readdirSync(join(restored, '.data/certs'))).toEqual([]);
    for (const file of manifest.files.filter((entry) => entry.path !== 'data/db.sqlite')) {
      const path = file.path.startsWith('media/') ? join(restored, '.data', file.path) : join(restored, file.path);
      expect(sha(readFileSync(path))).toBe(file.sha256);
    }

    // The restored database holds the same rows, and no sign-in sessions.
    const db = new DatabaseSync(join(restored, '.data/db.sqlite'), { readOnly: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM products').get()?.n).toBe(101);
    expect(db.prepare("SELECT title, price FROM products WHERE id = 101").get()).toMatchObject({ title: 'Snapshot lamp', price: 12.5 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM _refresh_tokens').get()?.n).toBe(0);
    db.close();

    const { url } = await open(restored);
    expect((await (await send(`${url}/products?limit=0`)).json() as { total: number }).total).toBe(101);
    const login = await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { accessToken: string };
    expect((await send(`${url}/auth/me`, 'GET', undefined, body.accessToken)).status).toBe(200);
    expect(new Uint8Array(await (await fetch(`${url}/media/${mediaId}`)).arrayBuffer())).toEqual(pdf);
    expect(await (await send(`${url}/stats/summary`)).json()).toEqual({ products: 101, users: 1 }); // the handler came along and runs
  });

  it('signs everyone out: an old access token and an old refresh token stop working after the import', async () => {
    const dir = join(tempDir(), 'source');
    createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
    const first = await open(dir);
    const old = (await (await send(`${first.url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' })).json()) as { accessToken: string; refreshToken: string };
    // Exported from the running engine through the admin route (a streamed zip, a consistent copy).
    const response = await fetch(`http://127.0.0.1:${first.backend.admin.port}/__admin/snapshot`, { headers: { authorization: `Bearer ${first.backend.admin.token}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect((await fetch(`http://127.0.0.1:${first.backend.port}/__admin/snapshot`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${first.backend.admin.port}/__admin/snapshot`)).status).toBe(401);
    const zip = join(tempDir(), 'live.zip');
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
    const restored = target();
    await importSnapshot(zip, restored);
    const second = await open(restored);
    expect((await send(`${second.url}/auth/me`, 'GET', undefined, old.accessToken)).status).toBe(401); // another secret
    expect((await send(`${second.url}/auth/refresh`, 'POST', { refreshToken: old.refreshToken })).status).toBe(401); // sessions are not carried over
    expect((await send(`${second.url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' })).status).toBe(200);
  });
});

describe('import refusals', () => {
  it('refuses a folder that is not empty (and leaves it alone), and a target that is a link', async () => {
    const { dir } = await populated();
    const zip = join(tempDir(), 'b.zip');
    await exportSnapshot({ dir }, zip);
    const busy = tempDir();
    writeFileSync(join(busy, '.hidden'), 'x');
    await expect(importSnapshot(zip, busy)).rejects.toThrow(/not empty/);
    expect(readdirSync(busy)).toEqual(['.hidden']);
    await expect(importSnapshot(zip, dir)).rejects.toThrow(/not empty/);
    const real = tempDir();
    const link = join(tempDir(), 'link');
    symlinkSync(real, link);
    await expect(importSnapshot(zip, link)).rejects.toThrow(/symbolic link/);
    expect(readdirSync(real)).toEqual([]);
    // An empty existing folder is fine.
    await expect(importSnapshot(zip, tempDir())).resolves.toMatchObject({ files: 5 });
  });

  const refused = async (items: Item[], pattern: RegExp, limits?: { maxEntries?: number; maxTotalBytes?: number }): Promise<void> => {
    const dest = target();
    await expect(importSnapshot(archive(items), dest, limits)).rejects.toThrow(pattern);
    expect(!existsSync(dest) || readdirSync(dest).length === 0).toBe(true); // nothing is left behind
  };

  it('refuses zip-slip names: absolute, "..", backslashes, drive letters', async () => {
    for (const name of ['../evil.txt', 'seed/../../evil.txt', '/etc/passwd', 'seed//x.json', 'seed/./x.json', 'C:/x', 'seed\\..\\x.json', 'seed/x\u0000.json']) {
      await refused(validItems([{ name, data: Buffer.from('x') }]), /not a usable snapshot/);
    }
  });

  it('refuses names outside the places a snapshot writes to, so secrets and certs cannot be smuggled in', async () => {
    for (const name of ['secrets.json', '.data/secrets.json', 'certs/cert.pem', 'data/other.sqlite', 'media', 'package.json']) {
      await refused(validItems([{ name, data: Buffer.from('x') }]), /not a place a snapshot writes to/);
    }
  });

  it('refuses a symbolic link entry and other special files', async () => {
    await refused(validItems([{ name: 'handlers/link.js', data: Buffer.from('/etc/passwd'), unixMode: 0o120777 }]), /symbolic link/);
    await refused(validItems([{ name: 'handlers/dev.js', data: Buffer.from(''), unixMode: 0o020666 }]), /not a regular file/);
  });

  it('refuses duplicate names, including ones that differ only in case', async () => {
    await refused(validItems([{ name: 'seed/a.json', data: Buffer.from('[]') }, { name: 'seed/a.json', data: Buffer.from('[]') }]), /twice/);
    await refused(validItems([{ name: 'seed/a.json', data: Buffer.from('[]') }, { name: 'seed/A.json', data: Buffer.from('[]') }]), /twice/);
  });

  it('refuses zip bombs: too many entries, a huge declared size, and data that inflates past what it declared', async () => {
    await refused(validItems([{ name: 'seed/a.json' }, { name: 'seed/b.json' }, { name: 'seed/c.json' }]), /limit is 3/, { maxEntries: 3 });
    const zeros = Buffer.alloc(20 * 1024 * 1024);
    await refused(validItems([{ name: 'media/aa/big', data: zeros }]), /more than 1000000 bytes/, { maxTotalBytes: 1_000_000 });
    // The directory claims 10 bytes, the deflate stream holds 20 MB.
    const liar = validItems([{ name: 'media/aa/liar', data: zeros, declared: 10 }]);
    await refused(liar, /inflates to more than it declared/);
  });

  it('refuses a snapshot whose files do not match the manifest, or whose manifest is missing or not valid', async () => {
    await refused(validItems([{ name: 'seed/a.json', data: Buffer.from('[1]') }], (manifest) => {
      (manifest.files as { sha256: string }[])[1]!.sha256 = 'f'.repeat(64);
    }), /does not match manifest\.json/);
    await refused(validItems([{ name: 'seed/a.json', data: Buffer.from('[1]') }], (manifest) => {
      manifest.files = (manifest.files as unknown[]).slice(0, 1);
    }), /do not match manifest\.json/);
    await refused(validItems().slice(0, 1), /manifest\.json is missing/);
    await refused(validItems([], (manifest) => {
      manifest.format = 2;
    }), /manifest\.json is not valid/);
    await refused([...validItems().slice(0, 1), { name: 'manifest.json', data: Buffer.from('nope') }], /manifest\.json is not valid/);
  });

  it('refuses a damaged file (checksum) and a file that is not a zip', async () => {
    const items = validItems();
    const file = join(tempDir(), 'broken.zip');
    const crcBroken = makeZip(items);
    const directoryAt = crcBroken.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    crcBroken.writeUInt32LE(0xdeadbeef, directoryAt + 16);
    writeFileSync(file, crcBroken);
    await expect(importSnapshot(file, target())).rejects.toThrow(/checksum/);
    const text = join(tempDir(), 'x.zip');
    writeFileSync(text, 'this is not a zip file at all, just text.');
    await expect(importSnapshot(text, target())).rejects.toThrow(/not a usable snapshot/);
    await expect(importSnapshot(join(tempDir(), 'missing.zip'), target())).rejects.toThrow(/not found/);
  });
});

describe('the export itself', () => {
  it('never reads secrets or certs, skips links, and refuses an existing output file', async () => {
    const { dir } = await populated();
    writeFileSync(join(dir, '.data/certs/cert.pem'), 'CERT');
    mkdirSync(join(dir, 'handlers/sub'), { recursive: true });
    symlinkSync('/etc/hosts', join(dir, 'handlers/sub/hosts.js'));
    const zip = join(tempDir(), 'x.zip');
    await exportSnapshot({ dir }, zip);
    const bytes = readFileSync(zip);
    expect(bytes.includes(Buffer.from('jwtSecret'))).toBe(false);
    expect(bytes.includes(Buffer.from('secrets.json'))).toBe(false);
    expect(bytes.includes(Buffer.from('cert.pem'))).toBe(false);
    expect(bytes.includes(Buffer.from('hosts.js'))).toBe(false);
    expect(lstatSync(zip).mode & 0o077).toBe(0);
    await expect(exportSnapshot({ dir }, zip)).rejects.toThrow(/EEXIST/);
  });
});

describe('CLI', () => {
  it('snapshot export then import (with --no-certs) and refuses a non-empty target with exit code 1', () => {
    const cli = join(import.meta.dirname, '../src/cli.ts');
    const dir = join(tempDir(), 'src');
    expect(spawnSync('node', [cli, 'create', dir, '--preset', 'tempo-template'], { encoding: 'utf8' }).status).toBe(0);
    const zip = join(tempDir(), 'cli.zip');
    expect(spawnSync('node', [cli, 'snapshot', 'export', dir, zip], { encoding: 'utf8' }).status).toBe(0);
    const restored = target();
    const imported = spawnSync('node', [cli, 'snapshot', 'import', zip, restored, '--no-certs'], { encoding: 'utf8' });
    expect(imported.status).toBe(0);
    expect(imported.stderr).toContain('new JWT secret');
    expect(existsSync(join(restored, 'backend.json'))).toBe(true);
    const again = spawnSync('node', [cli, 'snapshot', 'import', zip, restored, '--no-certs'], { encoding: 'utf8' });
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/not empty/);
  });
});
