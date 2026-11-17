import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import type { Backend } from './schema.ts';
import { DefinitionError } from './schema.ts';
import { buildOpenApi } from './openapi.ts';

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'] as const;
const MAX_OPENAPI_BYTES = 16 * 1024 * 1024;
const MAX_REF_DEPTH = 32;

export interface EndpointRef {
  method: string;
  path: string;
}

export type DifferenceKind = 'status' | 'missing-property' | 'not-required' | 'type' | 'nullable' | 'enum';

/** One way the backend's answer differs from the file's, with the property path (`products[].price`). */
export interface ShapeDifference {
  method: string;
  path: string;
  status: string;
  /** `""` for the whole body. */
  property: string;
  kind: DifferenceKind;
  expected: string;
  actual: string;
  message: string;
}

export interface MethodMismatch extends EndpointRef {
  /** The methods the backend has on that path. */
  backendMethods: string[];
}

export interface ContractReport {
  /** `true` when nothing is missing and nothing differs. Extra endpoints do not count. */
  ok: boolean;
  /** In the file, not in the backend. */
  missing: EndpointRef[];
  /** In the backend, not in the file (information only). */
  extra: EndpointRef[];
  /** The path exists in the backend but not with this method. */
  methodMismatches: MethodMismatch[];
  differences: ShapeDifference[];
  /** Endpoints whose answers could not be compared (the backend does not describe the shape, for example a handler). */
  unchecked: (EndpointRef & { status: string; reason: string })[];
  counts: { fileEndpoints: number; backendEndpoints: number; matched: number };
}

// ---- reading the file

/** Parses an OpenAPI document that is JSON text. */
export function parseOpenApi(text: string, label = 'The OpenAPI file'): Obj {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new DefinitionError(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return requireDocument(json, label);
}

export function requireDocument(json: unknown, label = 'The OpenAPI document'): Obj {
  if (!isObj(json) || !isObj(json.paths)) throw new DefinitionError(`${label} is not an OpenAPI document (no "paths").`);
  return json;
}

/** Reads a JSON OpenAPI file that must sit inside the backend folder (links are resolved and checked). */
export function readOpenApiInside(dir: string, relative: string): Obj {
  const root = realpathSync(resolve(dir));
  const target = resolve(root, relative);
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new DefinitionError(`No such file inside the backend folder: ${relative}`);
  }
  if (!real.startsWith(root + sep)) throw new DefinitionError('The OpenAPI file must be inside the backend folder.');
  const stat = lstatSync(real);
  if (!stat.isFile() || stat.size > MAX_OPENAPI_BYTES) throw new DefinitionError('The OpenAPI path must be a JSON file of at most 16 MB.');
  return parseOpenApi(readFileSync(real, 'utf8'), relative);
}

// ---- paths

/** The path part of the document's first server (`/`, `/api`, or an absolute URL's path), without a trailing slash. */
function serverBase(doc: Obj): string {
  const first = Array.isArray(doc.servers) ? doc.servers[0] : undefined;
  const url = isObj(first) && typeof first.url === 'string' ? first.url : '/';
  let path = url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      path = '/';
    }
  }
  return path.replace(/\/+$/, '');
}

/** `/api/products/{id}` with parameter names erased, so `{id}` and `{productId}` match. */
const normalize = (base: string, path: string): string => `${base}${path}`.replace(/\{[^}]*\}/g, '{}').replace(/\/+$/, '') || '/';

interface Operation {
  method: string;
  /** The path as written in its document, for messages. */
  path: string;
  node: Obj;
}

function operationsOf(doc: Obj): Map<string, Map<string, Operation>> {
  const base = serverBase(doc);
  const byPath = new Map<string, Map<string, Operation>>();
  for (const [path, item] of Object.entries(doc.paths as Obj)) {
    if (!isObj(item)) continue;
    const key = normalize(base, path);
    const methods = byPath.get(key) ?? new Map<string, Operation>();
    for (const method of METHODS) {
      const node = item[method];
      if (isObj(node)) methods.set(method.toUpperCase(), { method: method.toUpperCase(), path: `${base}${path}`, node });
    }
    byPath.set(key, methods);
  }
  return byPath;
}

// ---- schemas

interface Shape {
  types: string[];
  nullable: boolean;
  enumValues: string[] | undefined;
  properties: Obj | undefined;
  required: string[];
  items: unknown;
}

function resolveRef(doc: Obj, schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < MAX_REF_DEPTH && isObj(current) && typeof current.$ref === 'string'; depth += 1) {
    const ref = current.$ref;
    if (!ref.startsWith('#/')) return undefined;
    let node: unknown = doc;
    for (const part of ref.slice(2).split('/')) node = isObj(node) ? node[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
    current = node;
  }
  return isObj(current) && typeof current.$ref === 'string' ? undefined : current;
}

/** Flattens `$ref`, `allOf`, `oneOf`/`anyOf` with `null` and 3.0 `nullable` into the few facts that are compared. */
function shapeOf(doc: Obj, schema: unknown, depth = 0): Shape | undefined {
  const node = resolveRef(doc, schema);
  if (!isObj(node) || depth > MAX_REF_DEPTH) return undefined;
  const shape: Shape = { types: [], nullable: node.nullable === true, enumValues: undefined, properties: undefined, required: [], items: node.items };
  const addType = (type: unknown): void => {
    for (const entry of Array.isArray(type) ? type : [type]) {
      if (entry === 'null') shape.nullable = true;
      else if (typeof entry === 'string' && !shape.types.includes(entry)) shape.types.push(entry);
    }
  };
  addType(node.type);
  if (Array.isArray(node.enum)) shape.enumValues = node.enum.map((value) => JSON.stringify(value));
  if (isObj(node.properties)) shape.properties = { ...node.properties };
  if (Array.isArray(node.required)) shape.required = node.required.filter((name): name is string => typeof name === 'string');
  for (const part of Array.isArray(node.allOf) ? node.allOf : []) {
    const inner = shapeOf(doc, part, depth + 1);
    if (inner === undefined) continue;
    inner.types.forEach(addType);
    shape.nullable ||= inner.nullable;
    shape.properties = { ...inner.properties, ...shape.properties };
    shape.required.push(...inner.required);
    shape.enumValues ??= inner.enumValues;
    shape.items ??= inner.items;
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const parts = node[key];
    if (!Array.isArray(parts)) continue;
    const real = parts.filter((part) => !(isObj(part) && part.type === 'null'));
    if (real.length !== parts.length) shape.nullable = true;
    // A union of several real shapes is not compared; one real shape (the nullable case) is.
    if (real.length === 1) {
      const inner = shapeOf(doc, real[0], depth + 1);
      if (inner !== undefined) {
        inner.types.forEach(addType);
        shape.nullable ||= inner.nullable;
        shape.properties = { ...inner.properties, ...shape.properties };
        shape.required.push(...inner.required);
        shape.enumValues ??= inner.enumValues;
        shape.items ??= inner.items;
      }
    }
  }
  return shape;
}

const describeType = (shape: Shape): string => `${shape.types.join(' | ') || 'any'}${shape.nullable ? ' (or null)' : ''}`;

/** Whether a value of the backend's type is acceptable where the file wants `wanted`. `integer` fits `number`. */
const typeFits = (wanted: string[], actual: string[]): boolean => actual.every((type) => wanted.includes(type) || (type === 'integer' && wanted.includes('number')));

interface Walk {
  fileDoc: Obj;
  engineDoc: Obj;
  out: ShapeDifference[];
  at: { method: string; path: string; status: string };
}

function record(walk: Walk, property: string, kind: DifferenceKind, expected: string, actual: string, message: string): void {
  walk.out.push({ ...walk.at, property, kind, expected, actual, message });
}

/** Compares what the file says a property is with what the backend's schema says. Required-ness, type, enum, nesting. */
function compareSchemas(walk: Walk, wantedSchema: unknown, haveSchema: unknown, property: string, depth: number): void {
  if (depth > 12) return;
  const wanted = shapeOf(walk.fileDoc, wantedSchema);
  const have = shapeOf(walk.engineDoc, haveSchema);
  if (wanted === undefined || have === undefined) return;
  const at = property === '' ? 'the body' : `"${property}"`;
  if (wanted.types.length > 0 && have.types.length > 0 && !typeFits(wanted.types, have.types)) {
    record(walk, property, 'type', describeType(wanted), describeType(have), `${at} is ${describeType(have)} in the backend but the file says ${describeType(wanted)}.`);
    return;
  }
  if (have.nullable && !wanted.nullable && wanted.types.length > 0) {
    record(walk, property, 'nullable', describeType(wanted), describeType(have), `${at} can be null in the backend but the file does not allow null.`);
  }
  if (wanted.enumValues !== undefined) {
    if (have.enumValues === undefined) {
      if (have.types.length > 0) record(walk, property, 'enum', `one of ${wanted.enumValues.join(', ')}`, 'any value', `${at} has no enum in the backend; the file allows only ${wanted.enumValues.join(', ')}.`);
    } else {
      const outside = have.enumValues.filter((value) => !(wanted.enumValues ?? []).includes(value));
      if (outside.length > 0) record(walk, property, 'enum', `one of ${wanted.enumValues.join(', ')}`, `one of ${have.enumValues.join(', ')}`, `${at} can be ${outside.join(', ')} in the backend, which the file does not list.`);
    }
  }
  if (wanted.properties !== undefined && (have.types.length === 0 || have.types.includes('object'))) {
    for (const [name, child] of Object.entries(wanted.properties)) {
      const path = property === '' ? name : `${property}.${name}`;
      const mine = have.properties?.[name];
      if (mine === undefined) {
        if (wanted.required.includes(name) && have.properties !== undefined) record(walk, path, 'missing-property', 'present', 'absent', `"${path}" is required by the file but the backend never sends it.`);
        continue;
      }
      if (wanted.required.includes(name) && !have.required.includes(name)) {
        record(walk, path, 'not-required', 'always present', 'may be absent', `"${path}" is required by the file but the backend may leave it out.`);
      }
      compareSchemas(walk, child, mine, path, depth + 1);
    }
  }
  if (wanted.items !== undefined && have.items !== undefined) compareSchemas(walk, wanted.items, have.items, `${property}[]`, depth + 1);
}

/** The `application/json` schema of a response (or the only JSON-like content), and whether the response declares content at all. */
function responseSchema(response: unknown): { declared: boolean; schema: unknown } {
  if (!isObj(response) || !isObj(response.content)) return { declared: false, schema: undefined };
  const entry = Object.entries(response.content).find(([type]) => /json/i.test(type));
  if (entry === undefined || !isObj(entry[1])) return { declared: true, schema: undefined };
  return { declared: true, schema: entry[1].schema };
}

const successStatuses = (op: Operation): string[] => Object.keys(isObj(op.node.responses) ? op.node.responses : {}).filter((status) => /^2\d\d$/.test(status));

// ---- the check

/** Compares a backend definition with an OpenAPI document (the file is the contract; the backend must fit it). */
export function checkContract(definition: Backend, fileDoc: Obj): ContractReport {
  const engineDoc = buildOpenApi(definition) as Obj;
  const wantedOps = operationsOf(fileDoc);
  const haveOps = operationsOf(engineDoc);
  const report: ContractReport = { ok: true, missing: [], extra: [], methodMismatches: [], differences: [], unchecked: [], counts: { fileEndpoints: 0, backendEndpoints: 0, matched: 0 } };

  for (const [key, methods] of wantedOps) {
    const have = haveOps.get(key);
    for (const [method, wanted] of methods) {
      report.counts.fileEndpoints += 1;
      const mine = have?.get(method);
      if (have === undefined || have.size === 0) {
        report.missing.push({ method, path: wanted.path });
        continue;
      }
      if (mine === undefined) {
        report.methodMismatches.push({ method, path: wanted.path, backendMethods: [...have.keys()].sort() });
        continue;
      }
      report.counts.matched += 1;
      const walk: Walk = { fileDoc, engineDoc, out: report.differences, at: { method, path: wanted.path, status: '' } };
      const haveStatuses = new Set(successStatuses(mine));
      for (const status of successStatuses(wanted)) {
        walk.at = { method, path: wanted.path, status };
        if (!haveStatuses.has(status)) {
          record(walk, '', 'status', status, [...haveStatuses].join(', ') || 'none', `The file answers ${status}; the backend answers ${[...haveStatuses].join(', ') || 'no success status'}.`);
          continue;
        }
        const wantedBody = responseSchema((wanted.node.responses as Obj)[status]);
        const haveBody = responseSchema((mine.node.responses as Obj)[status]);
        if (wantedBody.schema === undefined) continue;
        if (haveBody.schema === undefined) {
          report.unchecked.push({ method, path: wanted.path, status, reason: 'The backend does not describe this answer (a handler or a file), so its shape is not compared.' });
          continue;
        }
        compareSchemas(walk, wantedBody.schema, haveBody.schema, '', 0);
      }
    }
  }
  for (const [key, methods] of haveOps) {
    for (const [method, op] of methods) {
      report.counts.backendEndpoints += 1;
      if (wantedOps.get(key)?.has(method) !== true) report.extra.push({ method, path: op.path });
    }
  }
  const order = (a: EndpointRef, b: EndpointRef): number => a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
  report.missing.sort(order);
  report.extra.sort(order);
  report.methodMismatches.sort(order);
  report.ok = report.missing.length === 0 && report.methodMismatches.length === 0 && report.differences.length === 0;
  return report;
}

/** The report as text for a terminal. */
export function formatReport(report: ContractReport): string {
  const lines: string[] = [];
  const row = (ref: EndpointRef): string => `${ref.method} ${ref.path}`;
  lines.push(report.ok ? 'No differences.' : 'The backend differs from the OpenAPI file.');
  lines.push(`${report.counts.matched} of ${report.counts.fileEndpoints} endpoints in the file are in the backend (${report.counts.backendEndpoints} in the backend).`);
  if (report.missing.length > 0) lines.push('', 'Missing in the backend:', ...report.missing.map((ref) => `  ${row(ref)}`));
  if (report.methodMismatches.length > 0) {
    lines.push('', 'Wrong method:', ...report.methodMismatches.map((ref) => `  ${row(ref)} (the backend has ${ref.backendMethods.join(', ')} on that path)`));
  }
  if (report.differences.length > 0) {
    lines.push('', 'Answers that differ:');
    for (const diff of report.differences) lines.push(`  ${diff.method} ${diff.path} ${diff.status}${diff.property === '' ? '' : ` ${diff.property}`}: ${diff.message}`);
  }
  if (report.unchecked.length > 0) lines.push('', 'Not compared (info):', ...report.unchecked.map((ref) => `  ${row(ref)} ${ref.status}: ${ref.reason}`));
  if (report.extra.length > 0) lines.push('', 'Only in the backend (info):', ...report.extra.map((ref) => `  ${row(ref)}`));
  return `${lines.join('\n')}\n`;
}

