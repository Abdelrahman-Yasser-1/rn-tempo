import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, resource } from '@rn-tempo/api-contract';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createLogger, createServer, type DevServer } from '../src/index.ts';

const Person = z.object({ id: z.number().int(), name: z.string(), email: z.string(), password: z.string() });
const people = resource('people', Person, {
  seed: [
    { id: 1, name: 'Ada', email: 'ada@example.com', password: 'hunter2' },
    { id: 2, name: 'Bo', email: 'bo@example.com', password: 'swordfish' },
  ],
});
const TOKEN = 'control-secret';

let dir: string;
let server: DevServer;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-data-'));
  server = createServer(defineConfig({ endpoints: [people] }), {
    dataDir: dir,
    logger: createLogger({ level: 'silent' }),
    controlToken: TOKEN,
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /__tempo/data', () => {
  it('needs the control token', async () => {
    expect((await request(server.app).get('/__tempo/data')).status).toBe(401);
    expect((await request(server.app).get('/__tempo/data').set('x-tempo-token', 'wrong')).status).toBe(401);
  });

  it('lists every stored collection with its row count', async () => {
    const res = await request(server.app).get('/__tempo/data').set('x-tempo-token', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.collections).toHaveLength(1);
    expect(res.body.collections[0]).toMatchObject({ name: 'people', total: 2 });
    expect(res.body.collections[0].items.map((item: { name: string }) => item.name)).toEqual(['Ada', 'Bo']);
  });

  it('redacts private fields, and does not change the stored records', async () => {
    const res = await request(server.app).get('/__tempo/data').set('x-tempo-token', TOKEN);
    const text = JSON.stringify(res.body);
    for (const secret of ['hunter2', 'swordfish', 'ada@example.com']) expect(text).not.toContain(secret);
    expect(server.store.db.collection('people').list()).toHaveLength(2);
    expect(JSON.stringify(server.store.db.collection('people').list())).toContain('hunter2');
  });

  it('reflects changes and a reset', async () => {
    server.store.db.collection('people').create({ name: 'Cy', email: 'cy@example.com', password: 'x' });
    const grown = await request(server.app).get('/__tempo/data').set('x-tempo-token', TOKEN);
    expect(grown.body.collections[0].total).toBe(3);
    await request(server.app).post('/__tempo/reset').set('x-tempo-token', TOKEN);
    const reset = await request(server.app).get('/__tempo/data').set('x-tempo-token', TOKEN);
    expect(reset.body.collections[0].total).toBe(2);
  });
});
