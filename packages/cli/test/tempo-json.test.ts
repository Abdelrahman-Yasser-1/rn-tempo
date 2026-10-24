import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CliError } from '../src/lib/errors.ts';
import { parseTempoJson, readTempoJson, writeTempoJson } from '../src/lib/tempo-json.ts';

const templateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../template');

describe('tempo-json', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tempo-json-'));
    await cp(path.join(templateDir, '.tempo.json'), path.join(dir, '.tempo.json'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads and validates the template .tempo.json', async () => {
    const data = await readTempoJson(dir);
    expect(data.app.name).toBe('TempoApp');
    expect(data.envs.map((env) => env.name)).toEqual(['dev', 'staging', 'prod']);
  });

  it('round-trips through writeTempoJson with a trailing newline and $schema first', async () => {
    const data = await readTempoJson(dir);
    await writeTempoJson(dir, { ...data, features: ['samples'] });
    const raw = await readFile(path.join(dir, '.tempo.json'), 'utf8');
    expect(raw.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(raw) as object)[0]).toBe('$schema');
    expect((await readTempoJson(dir)).features).toEqual(['samples']);
  });

  it('names the failing path for invalid data and refuses to write it', async () => {
    const data = await readTempoJson(dir);
    expect(() => parseTempoJson({ ...data, app: { ...data.app, name: 'bad name' } })).toThrow(CliError);
    await expect(writeTempoJson(dir, { ...data, features: ['nope' as never] })).rejects.toThrow(/invalid/);
  });

  it('reports a missing or malformed file clearly', async () => {
    await writeFile(path.join(dir, '.tempo.json'), '{ nope');
    await expect(readTempoJson(dir)).rejects.toThrow(/not valid JSON/);
    await rm(path.join(dir, '.tempo.json'));
    await expect(readTempoJson(dir)).rejects.toThrow(/not found/);
  });
});
