import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

interface Chunk {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  src?: string;
  imports?: string[];
  dynamicImports?: string[];
}

const out = mkdtempSync(join(tmpdir(), 'lb-manifest-'));
afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('AC-LP-6 Monaco loads only when an editor opens', () => {
  it('AC-LP-6 keeps Monaco out of the entry chunk: it is a dynamic import, with its workers as their own files', async () => {
    await build({ mode: 'web', logLevel: 'silent', configFile: join(import.meta.dirname, '../../vite.config.ts'), build: { outDir: out, emptyOutDir: true, manifest: true } });
    const manifest = JSON.parse(readFileSync(join(out, '.vite/manifest.json'), 'utf8')) as Record<string, Chunk>;
    const chunks = Object.values(manifest);
    const entry = chunks.find((chunk) => chunk.isEntry === true);
    const monaco = chunks.find((chunk) => chunk.src === 'src/editor/monacoAdapter.ts');
    expect(entry).toBeDefined();
    expect(monaco).toBeDefined();
    // The entry does not import the adapter statically; it only names it as a dynamic import.
    const staticImports = new Set<string>();
    const walk = (chunk: Chunk): void => {
      for (const key of chunk.imports ?? []) {
        if (staticImports.has(key)) continue;
        staticImports.add(key);
        const next = manifest[key];
        if (next !== undefined) walk(next);
      }
    };
    if (entry !== undefined) walk(entry);
    expect([...staticImports].some((key) => manifest[key]?.src?.includes('monaco'))).toBe(false);
    expect(entry?.dynamicImports?.some((key) => manifest[key]?.src === 'src/editor/monacoAdapter.ts')).toBe(true);
    // The entry file holds none of Monaco: it stays far smaller than the adapter chunk, and its text has no Monaco service.
    const entrySize = statSync(join(out, entry?.file ?? '')).size;
    const monacoSize = statSync(join(out, monaco?.file ?? '')).size;
    expect(monacoSize).toBeGreaterThan(entrySize * 3);
    expect(readFileSync(join(out, entry?.file ?? ''), 'utf8')).not.toContain('ICodeEditorService');
    // Both workers are separate files.
    expect(readdirSync(join(out, 'assets')).filter((name) => /worker.*\.js$/.test(name)).length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
