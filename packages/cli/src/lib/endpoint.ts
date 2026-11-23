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

const BACKEND_FILE = 'backend/backend.json';

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

// ---- the backend definition: `backend/backend.json` of the Tempo Local Backend

type BackendEntry = Record<string, unknown>;
type BackendFile = Record<string, unknown>;

/** The static endpoint a plain `tempo g endpoint` adds: it answers the stub the generated schema accepts. */
function staticEndpoint(vars: Pieces['vars'], { method, route, summary }: Pieces): BackendEntry {
  return {
    id: `${vars.featureCamel}.${vars.name}`,
    type: 'static',
    method,
    path: route,
    status: 200,
    body: { id: 1 },
    summary,
    tags: [vars.feature],
    wrap: 'none',
  };
}

/**
 * What `--resource` adds: a collection with three listed rows and the five CRUD endpoints the generated request
 * functions call (`POST {path}/add` is an alias of the create endpoint, as the app code expects).
 */
function resourceDefinition(vars: Pieces['vars'], route: string): { collection: BackendEntry; endpoints: BackendEntry[] } {
  const crud = (action: string, method: string, route: string, summary: string, extra: BackendEntry = {}): BackendEntry => ({
    id: `${vars.name}.${action}`,
    type: 'crud',
    collection: vars.name,
    action,
    method,
    path: route,
    ...extra,
    summary,
    tags: [vars.feature],
    wrap: 'none',
  });
  return {
    collection: {
      name: vars.name,
      fields: [{ name: 'title', type: 'string', required: true, default: '' }],
      seed: [1, 2, 3].map((id) => ({ id, title: `${vars.Name} ${id}` })),
    },
    endpoints: [
      crud('list', 'GET', route, `List ${vars.name}`),
      crud('get', 'GET', `${route}/:id`, `Get ${vars.name} by id`),
      crud('create', 'POST', route, `Create ${vars.name}`, { aliases: [`${route}/add`] }),
      crud('update', 'PATCH', `${route}/:id`, `Update ${vars.name}`),
      crud('delete', 'DELETE', `${route}/:id`, `Delete ${vars.name}`),
    ],
  };
}

/** Reads `backend/backend.json`; `undefined` when the project has no backend. */
async function readBackend(projectDir: string): Promise<BackendFile | undefined> {
  const file = path.join(projectDir, BACKEND_FILE);
  if (!(await pathExists(file))) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new CliError(`${BACKEND_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { code: 'BACKEND_UNPARSEABLE' });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(`${BACKEND_FILE} must hold one JSON object`, { code: 'BACKEND_UNPARSEABLE' });
  }
  const backend = parsed as BackendFile;
  for (const key of ['endpoints', 'collections']) {
    if (backend[key] !== undefined && !Array.isArray(backend[key])) {
      throw new CliError(`"${key}" in ${BACKEND_FILE} must be an array`, { code: 'BACKEND_UNPARSEABLE' });
    }
  }
  return backend;
}

const pathsOf = (entry: BackendEntry): string[] => [entry.path, ...(Array.isArray(entry.aliases) ? entry.aliases : [])].filter((value): value is string => typeof value === 'string');

/** Adds the endpoints (and collection) to the parsed file, or fails when the same id, method + path or collection exists. */
function addToBackend(backend: BackendFile, additions: { collection?: BackendEntry; endpoints: BackendEntry[] }): void {
  const existing = (backend.endpoints ?? []) as BackendEntry[];
  for (const added of additions.endpoints) {
    const clash = existing.find(
      (entry) => entry.id === added.id || (entry.method === added.method && pathsOf(entry).some((route) => pathsOf(added).includes(route))),
    );
    if (clash !== undefined) {
      throw new CliError(`${BACKEND_FILE} already has an endpoint for ${String(added.method)} ${String(added.path)} (id "${String(clash.id)}")`, { code: 'ENDPOINT_EXISTS' });
    }
  }
  const collections = (backend.collections ?? []) as BackendEntry[];
  if (additions.collection !== undefined) {
    if (collections.some((entry) => entry.name === additions.collection?.name)) {
      throw new CliError(`${BACKEND_FILE} already has a collection "${String(additions.collection.name)}"`, { code: 'ENDPOINT_EXISTS' });
    }
    backend.collections = [...collections, additions.collection];
  }
  backend.endpoints = [...existing, ...additions.endpoints];
}

// ---- the generator

type Pieces = {
  vars: TemplateVars & Record<string, string>;
  params: string[];
  hasBody: boolean;
  method: EndpointMethod;
  route: string;
  summary: string;
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
      signature,
      urlExpr,
      dataEntry: hasBody ? ', data: body' : '',
      hookParams: params.map((p) => `${p}: string`).join(', '),
      keyArgs: params.join(', '),
      keyParams: params.map((p) => `${p}: string`).join(', '),
      keyTail: params.map((p) => `, ${p}`).join(''),
      keys: '',
    },
    params,
    hasBody,
    method,
    route,
    summary: words(name),
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
 * `tempo g endpoint <feature>.<name>`: the feature's Zod schemas, API call, query key and TanStack Query
 * hook, and a `static` endpoint in `backend/backend.json` that answers the stub. Everything is a stub that
 * compiles: replace the schemas and the example body. With `resource` it adds a collection and the five
 * CRUD endpoints (list, get, create, update, delete) instead. A project without `backend/backend.json`
 * still gets the app code, and the result says no backend was found.
 */
export async function generateEndpoint(target: string, options: EndpointOptions): Promise<ScaffoldResult> {
  const pieces = buildPieces(target, options);
  const { vars, hasBody, method, route } = pieces;
  const { projectDir } = options;
  const resource = options.resource === true;
  const feature = vars.feature;
  if (!(await pathExists(path.join(projectDir, 'src/features', feature)))) {
    throw new CliError(`Feature "${feature}" does not exist. Create it first: tempo g feature ${feature}`, { code: 'FEATURE_NOT_FOUND' });
  }

  const { dir } = await resolveTemplateDir(projectDir, 'endpoint', options.builtInRoot);
  const snippet = async (file: string): Promise<string> => render(await readFile(path.join(dir, file), 'utf8'), vars);
  const apiDir = `src/features/${feature}/api`;

  const schemas = await new Edit(projectDir, `${apiDir}/schemas.ts`).load();
  const apiFile = await new Edit(projectDir, `${apiDir}/${feature}.api.ts`).load();
  const keys = await new Edit(projectDir, `${apiDir}/keys.ts`).load();
  const queries = await new Edit(projectDir, `${apiDir}/queries.ts`).load();
  const mutations = await new Edit(projectDir, `${apiDir}/mutations.ts`).load();
  const backend = await readBackend(projectDir);

  const exported = vars.name;
  if (new RegExp(`export function ${resource ? `list${vars.Name}` : exported}\\b`).test(apiFile.text)) {
    throw new CliError(`"${exported}" already exists in ${apiFile.rel}`, { code: 'FILE_EXISTS' });
  }
  if (backend !== undefined) addToBackend(backend, resource ? resourceDefinition(vars, route) : { endpoints: [staticEndpoint(vars, pieces)] });
  const keysVar = keysVarOf(keys.existed ? keys.text : undefined, `${vars.featureCamel}Keys`);
  vars.keys = keysVar;

  // 1. schemas
  schemas.text = addNamedImport(schemas.text, 'zod', 'z');
  append(schemas, await snippet(resource ? 'schema-resource.ts.tmpl' : 'schema-response.ts.tmpl'));
  if (hasBody) append(schemas, await snippet('schema-request.ts.tmpl'));

  // 2. the feature's request function(s)
  apiFile.text = addNamedImport(apiFile.text, '@services/http/request', 'request');
  const apiSchemas = resource
    ? [`${vars.Name}Schema`, `${vars.Name}PageSchema`, `${vars.Name}Input`]
    : [`${vars.Name}ResponseSchema`, ...(hasBody ? [`${vars.Name}Request`] : [])];
  for (const schemaName of apiSchemas) {
    apiFile.text = addNamedImport(apiFile.text, './schemas', schemaName, schemaName.endsWith('Schema') ? 'value' : 'type');
  }
  append(apiFile, await snippet(resource ? 'api-resource.ts.tmpl' : 'api-call.ts.tmpl'));

  // 3. query key(s) and hook(s)
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

  const edits = [schemas, apiFile, keys, ...(withQuery ? [queries] : []), ...(withMutation ? [mutations] : [])];
  if (!options.dryRun) {
    for (const edit of edits) await edit.save(projectDir);
    if (backend !== undefined) await writeFile(path.join(projectDir, BACKEND_FILE), `${JSON.stringify(backend, null, 2)}\n`);
  }
  return {
    created: edits.filter((edit) => !edit.existed).map((edit) => edit.rel),
    updated: [...edits.filter((edit) => edit.existed).map((edit) => edit.rel), ...(backend === undefined ? [] : [BACKEND_FILE])],
    followUps:
      backend === undefined
        ? [
            `No ${BACKEND_FILE} found: nothing answers ${resource ? 'these endpoints' : `${method} ${route}`} yet. Add the endpoint to your backend by hand`,
            `Replace the stub schemas in ${schemas.rel}`,
          ]
        : [`Replace the stub schemas in ${schemas.rel} and the example ${resource ? 'rows and fields' : 'body'} in ${BACKEND_FILE}`],
  };
}
