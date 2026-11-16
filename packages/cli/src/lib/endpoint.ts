import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CliError } from './errors.ts';
import { pathExists } from './fs-utils.ts';
import { buildVars, render, resolveTemplateDir, toKebab, type TemplateVars } from './generate.ts';
import type { ScaffoldOptions, ScaffoldResult } from './scaffold.ts';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type EndpointMethod = (typeof HTTP_METHODS)[number];

export type EndpointOptions = ScaffoldOptions & {
  method?: string | undefined;
  path?: string | undefined;
  resource?: boolean | undefined;
};

const CONFIG_FILE = 'api/tempo-api.config.ts';

// ---- text helpers: small, string based, and tested; they edit the files a person also edits

type ImportStatement = { start: number; end: number; source: string; group: number };

const ALIASES = /^@(app|navigation|features|shared|services|theme|assets|locales|config|test-utils|api)\//;

/** eslint `import-x/order` groups: external, alias (internal), parent, sibling. */
function importGroup(source: string): number {
  if (source.startsWith('../')) return 3;
  if (source.startsWith('./')) return 4;
  return ALIASES.test(source) ? 2 : 1;
}

function importStatements(text: string): ImportStatement[] {
  const found: ImportStatement[] = [];
  for (const match of text.matchAll(/^import\s[^;]*?from\s+'([^']+)';[^\S\n]*\n?/gms)) {
    const source = match[1] ?? '';
    found.push({ start: match.index, end: match.index + match[0].length, source, group: importGroup(source) });
  }
  return found;
}

/**
 * Makes `name` importable from `source`. A name already imported is left alone, a name from a module
 * that is already imported joins that import, and a new module gets a new import line in the group
 * and alphabetical place that `import-x/order` wants.
 */
export function addNamedImport(text: string, source: string, name: string, kind: 'value' | 'type' = 'value'): string {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+'${escaped}';`, 's').exec(text);
  const entry = kind === 'type' ? `type ${name}` : name;
  if (existing !== null) {
    const names = (existing[2] ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
    if (names.some((part) => part === name || part === `type ${name}`)) return text;
    const merged = [...names, existing[1] === undefined ? entry : name].join(', ');
    return `${text.slice(0, existing.index)}import ${existing[1] ?? ''}{ ${merged} } from '${source}';${text.slice(existing.index + existing[0].length)}`;
  }

  const line = `import ${kind === 'type' ? 'type ' : ''}{ ${name} } from '${source}';`;
  const imports = importStatements(text);
  const group = importGroup(source);
  const next = imports.find((item) => item.group > group || (item.group === group && item.source.toLowerCase() > source.toLowerCase()));
  const previous = [...imports].reverse().find((item) => item.start < (next?.start ?? Infinity));
  if (imports.length === 0) return `${line}\n\n${text.replace(/^\n+/, '')}`;
  let position = previous?.end ?? 0;
  let before = false;
  let after = false;
  if (previous === undefined || previous.group !== group) {
    if (next === undefined) {
      before = previous !== undefined;
    } else {
      position = next.start;
      before = previous !== undefined && !text.slice(0, position).endsWith('\n\n');
      after = next.group !== group;
    }
  }
  const head = text.slice(0, position);
  const joiner = head.endsWith('\n') || head === '' ? '' : '\n';
  return `${head}${joiner}${before ? '\n' : ''}${line}\n${after ? '\n' : ''}${text.slice(position)}`;
}

/** Index of the bracket that closes the one at `open`, skipping strings and comments. */
function matchingBracket(text: string, open: number): number {
  const closeOf: Record<string, string> = { '[': ']', '{': '}', '(': ')' };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const char = text.charAt(i);
    const next = text.charAt(i + 1);
    if (quote !== null) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
    } else if (char === '/' && next === '/') {
      i = text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i);
    } else if (char === '/' && next === '*') {
      i = text.indexOf('*/', i) < 0 ? text.length : text.indexOf('*/', i) + 1;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (closeOf[char] !== undefined) {
      stack.push(closeOf[char]);
    } else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Adds `entry` as the last item of the array that follows `anchor` (`endpoints: [`). Returns null when not found. */
export function appendToArray(text: string, anchor: RegExp, entry: string): string | null {
  const match = anchor.exec(text);
  if (match === null) return null;
  const open = match.index + match[0].length - 1;
  const close = matchingBracket(text, open);
  if (close < 0) return null;
  const inner = text.slice(open + 1, close);
  if (new RegExp(`(^|[^\\w.])${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,?\\s*(//.*)?$`, 'm').test(inner)) return text;
  const lines = inner.replace(/\s+$/, '').split('\n');
  const isComment = (line: string): boolean => line.trim() === '' || line.trim().startsWith('//');
  const lastReal = lines.reduce((found, line, index) => (isComment(line) ? found : index), -1);
  if (lastReal >= 0 && !(lines[lastReal] ?? '').trimEnd().endsWith(',') && !(lines[lastReal] ?? '').trimEnd().endsWith('[')) {
    lines[lastReal] = `${lines[lastReal] ?? ''},`;
  }
  const indent = inner.includes('\n') ? (/^\s*/.exec(lines[lastReal >= 0 ? lastReal : lines.length - 1] ?? '')?.[0] ?? '    ') : '    ';
  const closing = /\n[^\S\n]*$/.exec(inner)?.[0] ?? '\n';
  const body = lines.join('\n');
  return `${text.slice(0, open + 1)}${body}\n${indent}${entry},${closing}${text.slice(close)}`;
}

/** Adds `line` before the `};` that closes the keys object. Returns null when there is none. */
function appendToKeys(text: string, keysVar: string, lines: string): string | null {
  const match = new RegExp(`export const ${keysVar}\\s*=\\s*\\{`).exec(text);
  if (match === null) return null;
  const close = matchingBracket(text, match.index + match[0].length - 1);
  if (close < 0) return null;
  const head = text.slice(0, close).replace(/[^\S\n]*$/, '');
  return `${head}${head.endsWith('\n') ? '' : '\n'}${lines}${text.slice(close)}`;
}

/** The name of the keys object (`itemKeys`), read from `keys.ts`; a new file uses `<feature>Keys`. */
function keysVarOf(text: string | undefined, fallback: string): string {
  return (text === undefined ? undefined : /export const (\w+)\s*=\s*\{[^}]*\ball:/s.exec(text)?.[1]) ?? fallback;
}

// ---- the generator

type Pieces = {
  vars: TemplateVars & Record<string, string>;
  params: string[];
  hasBody: boolean;
  method: EndpointMethod;
};

function parseTarget(target: string): { feature: string; name: string } {
  const parts = target.split('.');
  if (parts.length !== 2 || parts.some((part) => part === '')) {
    throw new CliError(`"${target}" is not <feature>.<name>, for example items.getItem`, { code: 'INVALID_NAME' });
  }
  return { feature: parts[0] ?? '', name: parts[1] ?? '' };
}

function normalizeMethod(method: string | undefined): EndpointMethod {
  const upper = (method ?? 'GET').toUpperCase();
  const found = HTTP_METHODS.find((candidate) => candidate === upper);
  if (found === undefined) throw new CliError(`Invalid --method "${method ?? ''}": use ${HTTP_METHODS.join(', ')}`, { code: 'INVALID_METHOD' });
  return found;
}

function normalizePath(value: string | undefined, fallback: string): string {
  const raw = value ?? fallback;
  if (!raw.startsWith('/') || /\s/.test(raw)) throw new CliError(`Invalid --path "${raw}": it must start with "/" and have no spaces`, { code: 'INVALID_PATH' });
  return raw;
}

function words(name: string): string {
  const text = toKebab(name).replaceAll('-', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildPieces(target: string, options: EndpointOptions): Pieces {
  const { feature, name } = parseTarget(target);
  const vars = buildVars(name, feature, options.date);
  const method = normalizeMethod(options.method);
  const resource = options.resource === true;
  const route = normalizePath(options.path, resource ? `/${vars.name_kebab}` : `/${vars.feature}/${vars.name_kebab}`);
  if (resource && options.method !== undefined) throw new CliError('--resource defines all five methods; leave out --method', { code: 'INVALID_METHOD' });
  const params = [...route.matchAll(/:([A-Za-z_]\w*)/g)].map((match) => match[1] ?? '');
  const hasBody = !resource && (method === 'POST' || method === 'PUT' || method === 'PATCH');

  const objectArgs = hasBody && params.length > 0;
  const signature = objectArgs
    ? `{ ${[...params, 'body'].join(', ')} }: Readonly<{ ${[...params.map((p) => `${p}: string`), `body: ${vars.Name}Request`].join('; ')} }>`
    : hasBody
      ? `body: Readonly<${vars.Name}Request>`
      : params.map((p) => `${p}: string`).join(', ');
  const urlExpr = params.length > 0 ? `\`${route.replace(/:([A-Za-z_]\w*)/g, '${$1}')}\`` : `'${route}'`;

  return {
    vars: {
      ...vars,
      method,
      path: route,
      summary: words(name),
      signature,
      urlExpr,
      dataEntry: hasBody ? ', data: body' : '',
      paramsLine: params.length > 0 ? `\n  params: z.object({ ${params.map((p) => `${p}: z.string()`).join(', ')} }),` : '',
      bodyLine: hasBody ? `\n  body: ${vars.Name}RequestSchema,` : '',
      hookParams: params.map((p) => `${p}: string`).join(', '),
      keyArgs: params.join(', '),
      keyParams: params.map((p) => `${p}: string`).join(', '),
      keyTail: params.map((p) => `, ${p}`).join(''),
      keys: '',
    },
    params,
    hasBody,
    method,
  };
}

type Prettier = {
  resolveConfig(file: string): Promise<Record<string, unknown> | null>;
  format(text: string, options: Record<string, unknown>): Promise<string>;
};

/**
 * Formats with the project's own Prettier, so the generated code passes `yarn format:check` without
 * a manual step. Without an installed Prettier (a fresh clone, tests) the text is written as is.
 */
async function formatWithProjectPrettier(projectDir: string, file: string, text: string): Promise<string> {
  try {
    const resolved = createRequire(path.join(projectDir, 'package.json')).resolve('prettier');
    const prettier = (await import(pathToFileURL(resolved).href)) as Prettier & { default?: Prettier };
    const api = prettier.default ?? prettier;
    const config = await api.resolveConfig(file);
    return await api.format(text, { ...config, filepath: file });
  } catch {
    return text;
  }
}

/** A project file, read once and written back once; `undefined` while the file does not exist. */
class Edit {
  readonly rel: string;
  private readonly file: string;
  existed = false;
  text = '';

  constructor(projectDir: string, rel: string) {
    this.rel = rel;
    this.file = path.join(projectDir, rel);
  }

  async load(): Promise<this> {
    this.existed = await pathExists(this.file);
    this.text = this.existed ? await readFile(this.file, 'utf8') : '';
    return this;
  }

  async save(projectDir: string): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, await formatWithProjectPrettier(projectDir, this.file, this.text));
  }
}

/** Appends a rendered snippet; an empty file starts with the snippet's leading blank line removed. */
function append(edit: Edit, snippet: string): void {
  const base = edit.text === '' ? '' : edit.text.replace(/\s*$/, '\n');
  edit.text = `${base}${edit.text === '' ? snippet.replace(/^\n+/, '') : snippet}`;
}

/**
 * `tempo g endpoint <feature>.<name>`: one definition in `api/endpoints/<feature>.ts`, registered in
 * `api/tempo-api.config.ts`, with its Zod schemas, API call, query key and TanStack Query hook in
 * the feature. Everything is a stub that compiles: replace the schemas and the fixed `data`.
 * With `resource` it writes a `resource(...)` with list, get, create, update and delete instead.
 */
export async function generateEndpoint(target: string, options: EndpointOptions): Promise<ScaffoldResult> {
  const { vars, params, hasBody, method } = buildPieces(target, options);
  const { projectDir } = options;
  const resource = options.resource === true;
  const feature = vars.feature;
  if (!(await pathExists(path.join(projectDir, 'src/features', feature)))) {
    throw new CliError(`Feature "${feature}" does not exist. Create it first: tempo g feature ${feature}`, { code: 'FEATURE_NOT_FOUND' });
  }
  if (!(await pathExists(path.join(projectDir, CONFIG_FILE)))) {
    throw new CliError(`${CONFIG_FILE} not found. Endpoint definitions need the dev API (@rn-tempo/dev-api).`, { code: 'API_CONFIG_MISSING' });
  }

  const { dir } = await resolveTemplateDir(projectDir, 'endpoint', options.builtInRoot);
  const snippet = async (file: string): Promise<string> => render(await readFile(path.join(dir, file), 'utf8'), vars);
  const apiDir = `src/features/${feature}/api`;

  const schemas = await new Edit(projectDir, `${apiDir}/schemas.ts`).load();
  const definitions = await new Edit(projectDir, `api/endpoints/${feature}.ts`).load();
  const apiFile = await new Edit(projectDir, `${apiDir}/${feature}.api.ts`).load();
  const keys = await new Edit(projectDir, `${apiDir}/keys.ts`).load();
  const queries = await new Edit(projectDir, `${apiDir}/queries.ts`).load();
  const mutations = await new Edit(projectDir, `${apiDir}/mutations.ts`).load();
  const config = await new Edit(projectDir, CONFIG_FILE).load();

  const exported = vars.name;
  if (new RegExp(`export const ${exported}\\b`).test(definitions.text) || new RegExp(`export function ${resource ? `list${vars.Name}` : exported}\\b`).test(apiFile.text)) {
    throw new CliError(`"${exported}" already exists in ${definitions.rel} or ${apiFile.rel}`, { code: 'FILE_EXISTS' });
  }
  const keysVar = keysVarOf(keys.existed ? keys.text : undefined, `${vars.featureCamel}Keys`);
  vars.keys = keysVar;

  // 1. schemas
  schemas.text = addNamedImport(schemas.text, 'zod', 'z');
  append(schemas, await snippet(resource ? 'schema-resource.ts.tmpl' : 'schema-response.ts.tmpl'));
  if (hasBody) append(schemas, await snippet('schema-request.ts.tmpl'));

  // 2. definition, registered in the config
  const schemaSource = `@features/${feature}/api/schemas`;
  definitions.text = addNamedImport(definitions.text, '@rn-tempo/api-contract', resource ? 'resource' : 'defineEndpoint');
  if (!resource && params.length > 0) definitions.text = addNamedImport(definitions.text, 'zod', 'z');
  const defNames = resource ? [`${vars.Name}Schema`] : [`${vars.Name}ResponseSchema`, ...(hasBody ? [`${vars.Name}RequestSchema`] : [])];
  for (const schemaName of defNames) definitions.text = addNamedImport(definitions.text, schemaSource, schemaName);
  append(definitions, await snippet(resource ? 'definition-resource.ts.tmpl' : 'definition.ts.tmpl'));
  const importLine = addNamedImport(config.text, `./endpoints/${feature}`, exported);
  const registered = appendToArray(importLine, /endpoints:\s*\[/, exported);
  if (registered === null) {
    throw new CliError(`Could not find "endpoints: [" in ${CONFIG_FILE}. Add ${exported} to the endpoint list by hand.`, { code: 'CONFIG_UNPARSEABLE' });
  }
  config.text = registered;

  // 3. the feature's request function(s)
  apiFile.text = addNamedImport(apiFile.text, '@services/http/request', 'request');
  const apiSchemas = resource
    ? [`${vars.Name}Schema`, `${vars.Name}PageSchema`, `${vars.Name}Input`]
    : [`${vars.Name}ResponseSchema`, ...(hasBody ? [`${vars.Name}Request`] : [])];
  for (const schemaName of apiSchemas) {
    apiFile.text = addNamedImport(apiFile.text, './schemas', schemaName, schemaName.endsWith('Schema') ? 'value' : 'type');
  }
  append(apiFile, await snippet(resource ? 'api-resource.ts.tmpl' : 'api-call.ts.tmpl'));

  // 4. query key(s) and hook(s)
  const keyLines = resource ? await snippet('keys-resource.ts.tmpl') : await snippet('keys-entry.ts.tmpl');
  if (keys.existed) {
    const added = appendToKeys(keys.text, keysVar, keyLines);
    if (added === null) throw new CliError(`Could not find "export const ${keysVar} = {" in ${keys.rel}. Add the query key by hand.`, { code: 'KEYS_UNPARSEABLE' });
    keys.text = added;
  } else {
    keys.text = `/** Query keys of the ${feature} feature. Keep them here so invalidation stays predictable. */\nexport const ${keysVar} = {\n  all: ['${feature}'] as const,\n${keyLines}};\n`;
  }
  const apiModule = `./${feature}.api`;
  const apiNames = resource ? [`list${vars.Name}`, `get${vars.Name}`, `create${vars.Name}`, `update${vars.Name}`, `delete${vars.Name}`] : [exported];
  const withQuery = resource || method === 'GET';
  const withMutation = resource || method !== 'GET';
  if (withQuery) {
    queries.text = addNamedImport(queries.text, '@tanstack/react-query', 'useQuery');
    for (const apiName of resource ? apiNames.slice(0, 2) : apiNames) queries.text = addNamedImport(queries.text, apiModule, apiName);
    queries.text = addNamedImport(queries.text, './keys', keysVar);
    append(queries, await snippet(resource ? 'query-resource.ts.tmpl' : 'query.ts.tmpl'));
  }
  if (withMutation) {
    mutations.text = addNamedImport(mutations.text, '@tanstack/react-query', 'useMutation');
    mutations.text = addNamedImport(mutations.text, '@tanstack/react-query', 'useQueryClient');
    for (const apiName of resource ? apiNames.slice(2) : apiNames) mutations.text = addNamedImport(mutations.text, apiModule, apiName);
    mutations.text = addNamedImport(mutations.text, './keys', keysVar);
    append(mutations, await snippet(resource ? 'mutation-resource.ts.tmpl' : 'mutation.ts.tmpl'));
  }

  const edits = [schemas, definitions, apiFile, keys, config, ...(withQuery ? [queries] : []), ...(withMutation ? [mutations] : [])];
  if (!options.dryRun) for (const edit of edits) await edit.save(projectDir);
  return {
    created: edits.filter((edit) => !edit.existed).map((edit) => edit.rel),
    updated: edits.filter((edit) => edit.existed).map((edit) => edit.rel),
    followUps: [
      `Replace the stub schemas in ${schemas.rel} and the fixed data in ${definitions.rel}`,
      'Run yarn api generate (openapi, collections and msw handlers), then yarn verify',
    ],
  };
}
