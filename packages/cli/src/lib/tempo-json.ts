import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TempoJson } from '@rn-tempo/contracts';

import { CliError } from './errors.ts';
import { formatSchemaErrors, validators } from './schema.ts';

export const TEMPO_JSON = '.tempo.json';
export const TEMPO_JSON_SCHEMA_URL = 'https://unpkg.com/@rn-tempo/contracts/schemas/tempo.schema.json';

/** Validates unknown data against the `.tempo.json` schema (contract C8). */
export function parseTempoJson(data: unknown, source = TEMPO_JSON): TempoJson {
  const { tempo } = validators();
  if (!tempo(data)) {
    throw new CliError(`${source} is invalid`, { code: 'TEMPO_JSON_INVALID', details: formatSchemaErrors(tempo) });
  }
  return data as TempoJson;
}

/** Reads and validates `<dir>/.tempo.json`. */
export async function readTempoJson(dir: string): Promise<TempoJson> {
  const file = path.join(dir, TEMPO_JSON);
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new CliError(`${TEMPO_JSON} not found in ${dir}. Run this command inside a tempo project (or pass --cwd).`, {
      code: 'NOT_A_TEMPO_PROJECT',
    });
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`${TEMPO_JSON} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      code: 'TEMPO_JSON_INVALID',
    });
  }
  return parseTempoJson(data);
}

/** Validates, then writes `<dir>/.tempo.json` (2-space JSON, trailing newline). */
export async function writeTempoJson(dir: string, data: TempoJson): Promise<void> {
  const withSchema: TempoJson = { $schema: TEMPO_JSON_SCHEMA_URL, ...data };
  parseTempoJson(withSchema);
  await writeFile(path.join(dir, TEMPO_JSON), `${JSON.stringify(withSchema, null, 2)}\n`);
}
