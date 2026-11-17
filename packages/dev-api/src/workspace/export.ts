import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { responseSchema, usableExample } from './load.ts';
import type { Workspace, WorkspaceEndpoint } from './schema.ts';
import { quote, zodSource } from './zod-source.ts';

export interface ExportedFiles {
  /** Paths relative to the project folder, in write order. */
  files: Record<string, string>;
  warnings: string[];
}

const words = (text: string): string[] => text.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** `getProductsId` for `get.products.:id`, unique within the set and a valid identifier. */
function constName(endpoint: WorkspaceEndpoint, taken: Set<string>): string {
  const [first = 'endpoint', ...rest] = words(`${endpoint.method.toLowerCase()} ${endpoint.path}`);
  let name = first.toLowerCase() + rest.map(capital).join('');
  if (/^\d/.test(name)) name = `endpoint${capital(name)}`;
  for (let n = 2; taken.has(name); n++) name = `${first.toLowerCase()}${rest.map(capital).join('')}${n}`;
  taken.add(name);
  return name;
}

/** `appConfig` for the tag "app config"; `default` when an endpoint has no tag. */
export function fileNameFor(tags: readonly string[] | undefined): string {
  const [first = 'default', ...rest] = words(tags?.[0] ?? 'default');
  const name = first.toLowerCase() + rest.map((word) => capital(word.toLowerCase())).join('');
  return /^\d/.test(name) ? `tag${capital(name)}` : name;
}

const indent = (text: string, spaces: number): string => text.split('\n').map((line, i) => (i === 0 ? line : ' '.repeat(spaces) + line)).join('\n');

function endpointSource(endpoint: WorkspaceEndpoint, name: string, warnings: string[]): string {
  const { request, response } = endpoint;
  const lines: string[] = [
    `  id: ${quote(endpoint.id)},`,
    `  method: '${endpoint.method}',`,
    `  path: ${quote(endpoint.path)},`,
  ];
  if (endpoint.summary !== undefined) lines.push(`  summary: ${quote(endpoint.summary)},`);
  if (endpoint.tags !== undefined && endpoint.tags.length > 0) lines.push(`  tags: [${endpoint.tags.map(quote).join(', ')}],`);
  if (endpoint.auth !== undefined) lines.push(`  auth: '${endpoint.auth}',`);
  if (request?.params !== undefined) lines.push(`  params: ${zodSource(request.params, { text: true, level: 1 })},`);
  if (request?.query !== undefined) lines.push(`  query: ${zodSource(request.query, { text: true, level: 1 })},`);
  if (request?.body !== undefined) lines.push(`  body: ${zodSource(request.body, { level: 1 })},`);
  if (response.status !== 200) lines.push(`  status: ${response.status},`);
  lines.push(`  response: ${response.schema === undefined ? (response.status === 204 ? 'z.undefined()' : 'z.record(z.string(), z.unknown())') : zodSource(response.schema, { level: 1 })},`);

  // Fixed data only when the example is valid for the schema; otherwise the generator fills it in.
  const example = usableExample(endpoint, responseSchema(endpoint), warnings);
  if (example !== undefined && !(response.schema === undefined && Object.keys(example as object).length === 0)) {
    lines.push(`  data: () => (${indent(JSON.stringify(example, null, 2), 2)}),`);
  } else if (response.status === 204) {
    lines.push('  data: () => undefined,');
  }
  const scenarios = Object.entries(endpoint.scenarios ?? {});
  if (scenarios.length > 0) {
    lines.push('  scenarios: {');
    for (const [scenario, value] of scenarios) lines.push(`    ${/^[A-Za-z_$][\w$]*$/.test(scenario) ? scenario : quote(scenario)}: ${indent(JSON.stringify(value, null, 2), 4)},`);
    lines.push('  },');
  }
  return `export const ${name} = defineEndpoint({\n${lines.join('\n')}\n});\n`;
}

/** The TypeScript project for a workspace: `api/tempo-api.config.ts` and one `api/endpoints/<tag>.ts` per tag. */
export function exportCode(workspace: Workspace): ExportedFiles {
  const warnings: string[] = [];
  const taken = new Set<string>();
  const byFile = new Map<string, { name: string; source: string }[]>();
  for (const endpoint of workspace.endpoints) {
    const name = constName(endpoint, taken);
    const file = fileNameFor(endpoint.tags);
    const list = byFile.get(file) ?? [];
    list.push({ name, source: endpointSource(endpoint, name, warnings) });
    byFile.set(file, list);
  }

  const files: Record<string, string> = {};
  const imports: string[] = [];
  const names: string[] = [];
  for (const [file, entries] of byFile) {
    files[`api/endpoints/${file}.ts`] = [
      "import { defineEndpoint } from '@rn-tempo/api-contract';",
      "import { z } from 'zod';",
      '',
      entries.map((entry) => entry.source).join('\n'),
    ].join('\n');
    imports.push(`import { ${entries.map((entry) => entry.name).join(', ')} } from './endpoints/${file}';`);
    names.push(...entries.map((entry) => entry.name));
  }
  const options: string[] = [];
  if (workspace.basePath !== undefined) options.push(`  basePath: ${quote(workspace.basePath)},`);
  if (workspace.port !== undefined) options.push(`  port: ${workspace.port},`);
  if (workspace.seed !== undefined) options.push(`  seed: ${workspace.seed},`);
  // Bearer endpoints need the dev API's mock login to get a token, as they did in the workspace.
  if (workspace.endpoints.some((endpoint) => endpoint.auth === 'bearer')) options.push('  auth: true,');
  files['api/tempo-api.config.ts'] = [
    "import { defineConfig } from '@rn-tempo/api-contract';",
    '',
    ...imports,
    '',
    '/** Exported from a tempo-api.json workspace. Edit the endpoints in `api/endpoints/`. */',
    'export default defineConfig({',
    ...options,
    `  endpoints: [${names.join(', ')}],`,
    '});',
    '',
  ].join('\n');
  return { files, warnings };
}

/** Writes the files under `projectDir`. Refuses to touch any file that exists unless `force` is set, and writes nothing then. */
export function writeExport(projectDir: string, files: Record<string, string>, force: boolean): string[] {
  const targets = Object.keys(files).map((relative) => join(projectDir, relative));
  const existing = targets.filter((file) => existsSync(file));
  if (existing.length > 0 && !force) {
    throw new Error(`These files already exist; nothing was written. Use --force to overwrite them:\n${existing.map((file) => `  ${file}`).join('\n')}`);
  }
  for (const [relative, text] of Object.entries(files)) {
    const file = join(projectDir, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return targets;
}
