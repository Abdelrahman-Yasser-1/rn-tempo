import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBackend, openBackend, readSeedFile } from '../src/folder.ts';
import { DefinitionError } from '../src/schema.ts';

const temp = (): string => mkdtempSync(join(tmpdir(), 'lb-folder-'));

describe('backend folder', () => {
  it('createBackend writes a minimal backend.json and openBackend makes .data with its own .gitignore', () => {
    const dir = join(temp(), 'b');
    const folder = createBackend(dir, { name: 'demo' });
    expect(JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8'))).toMatchObject({ name: 'demo', port: 8443 });
    expect(readFileSync(join(dir, '.data/.gitignore'), 'utf8')).toBe('*\n');
    expect(folder.definition.name).toBe('demo');
    expect(() => createBackend(dir, { name: 'again' })).toThrow(/already exists/);
  });

  it('reports a missing or invalid backend.json clearly', () => {
    const dir = temp();
    expect(() => openBackend(dir)).toThrow(/not found/);
    writeFileSync(join(dir, 'backend.json'), '{ nope');
    expect(() => openBackend(dir)).toThrow(/not valid JSON/);
    writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'x', port: 0 }));
    expect(() => openBackend(dir)).toThrow(/port/);
  });

  it('refuses a .data that is a symlink and never follows it', () => {
    const dir = temp();
    const elsewhere = temp();
    writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'x' }));
    symlinkSync(elsewhere, join(dir, '.data'));
    expect(() => openBackend(dir)).toThrow(DefinitionError);
    expect(() => openBackend(dir)).toThrow(/symbolic link/);
    expect(existsSync(join(elsewhere, '.gitignore'))).toBe(false);
  });

  it('refuses a logs folder that is a symlink', () => {
    const dir = temp();
    writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'x' }));
    mkdirSync(join(dir, '.data'));
    symlinkSync(temp(), join(dir, '.data/logs'));
    expect(() => openBackend(dir)).toThrow(/symbolic link/);
  });

  it('reads seed files only from inside seed/', () => {
    const dir = temp();
    mkdirSync(join(dir, 'seed'));
    writeFileSync(join(dir, 'seed/a.json'), '[{"x":1}]');
    writeFileSync(join(dir, 'outside.json'), '[{"x":2}]');
    symlinkSync(join(dir, 'outside.json'), join(dir, 'seed/link.json'));
    expect(readSeedFile(dir, 'a.json')).toEqual([{ x: 1 }]);
    expect(() => readSeedFile(dir, '../outside.json')).toThrow(/outside/);
    expect(() => readSeedFile(dir, 'link.json')).toThrow(/outside/);
    expect(() => readSeedFile(dir, 'missing.json')).toThrow(/not found/);
  });
});
