import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { defineCommand } from 'citty';

import { allFiles, collectionFiles, mswFiles, openapiFiles } from '../docs/outputs.ts';
import { loadConfig } from './config.ts';
import { DEFAULT_CONFIG, resolvePaths } from './paths.ts';

const args = {
  config: { type: 'string', description: `Config file (default ${DEFAULT_CONFIG})` },
  cwd: { type: 'string', description: 'Project folder (default: the current folder)' },
  out: { type: 'string', description: 'Output folder (default: generated/ next to the config)' },
} as const;

type Files = Record<string, string>;
type Build = (config: Awaited<ReturnType<typeof loadConfig>>, configPath: string, outDir: string) => Files;

function fail(message: string): never {
  process.stderr.write(`tempo-api: ${message}\n`);
  process.exit(1);
}

const say = (line: string): void => void process.stdout.write(`${line}\n`);

async function prepare(input: { cwd?: string | undefined; config?: string | undefined; out?: string | undefined }) {
  const paths = resolvePaths(input.cwd, input.config);
  const outDir = input.out === undefined ? join(paths.config, '..', 'generated') : join(paths.cwd, input.out);
  try {
    return { paths, outDir, config: await loadConfig(paths.config) };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function write(outDir: string, cwd: string, files: Files, log = true): void {
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(outDir, name), text);
    if (log) say(`  wrote ${relative(cwd, join(outDir, name))}`);
  }
}

function generator(name: string, description: string, build: Build) {
  return defineCommand({
    meta: { name, description },
    args,
    async run({ args: given }) {
      const { paths, outDir, config } = await prepare(given);
      write(outDir, paths.cwd, build(config, paths.config, outDir));
    },
  });
}

export const openapi = generator('openapi', 'Write the OpenAPI 3.1 document', (config) => openapiFiles(config));
export const collections = generator('collections', 'Write the Postman collection and environment', (config) => collectionFiles(config));
export const msw = generator('msw', 'Write the MSW handlers file', (_config, configPath, outDir) => mswFiles(configPath, outDir));
export const generateAll = generator('generate', 'Write the OpenAPI document, the Postman files and the MSW handlers', (config, configPath, outDir) =>
  allFiles(config, configPath, outDir),
);

/** Lists the files that differ between what is written and what the config generates now. */
export function diffGenerated(outDir: string, expected: Files): string[] {
  const problems: string[] = [];
  for (const [name, text] of Object.entries(expected)) {
    const file = join(outDir, name);
    if (!existsSync(file)) problems.push(`${name} is missing`);
    else if (readFileSync(file, 'utf8') !== text) problems.push(`${name} is out of date`);
  }
  return problems;
}

/**
 * Regenerates everything into a temporary folder and compares it with the files in `generated/`.
 * Exits with 1 when any file differs, so a pre-commit hook or CI can stop a stale document.
 */
export const check = defineCommand({
  meta: { name: 'check', description: 'Fail when the generated files are out of date' },
  args,
  async run({ args: given }) {
    const { paths, outDir, config } = await prepare(given);
    const temp = mkdtempSync(join(tmpdir(), 'tempo-api-check-'));
    try {
      // The MSW file's import path depends on where it sits, so it is built for the real folder.
      const expected = allFiles(config, paths.config, outDir);
      write(temp, temp, expected, false);
      const problems = diffGenerated(outDir, Object.fromEntries(Object.keys(expected).map((name) => [name, readFileSync(join(temp, name), 'utf8')])));
      if (problems.length > 0) {
        for (const problem of problems) process.stderr.write(`tempo-api: ${problem}\n`);
        fail('Generated files are stale. Run `tempo-api generate` and commit the result.');
      }
      say(`Generated files are up to date (${Object.keys(expected).length} files).`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  },
});
