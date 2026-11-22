import type { IncomingHttpHeaders } from 'node:http';

import { isSensitiveKey } from '@rn-tempo/dev-api';

import { FIRST, LAST, Rng, WORDS } from './import/generate.ts';

/**
 * Logic-less dynamic values for responses: `{{params.id}}`, `{{query.q}}`, `{{body.user.name}}`, `{{headers.x_request_id}}`,
 * `{{user.id}}`, `{{now}}`, `{{uuid}}`, `{{seq}}`, `{{random.int 1 100}}`, `{{fake.name}}` and the `{{with.x}}` values of a
 * template reference.
 *
 * There is no evaluation here. A tiny tokenizer cuts a string at `{{ ... }}`; each token is a dotted path of
 * `[A-Za-z0-9_]` segments (plus, for `random.int`, up to two integers, and the one filter `| number`) that is looked up in a
 * fixed set of sources. Nothing is ever run, concatenated into code or used to reach a prototype.
 *
 * Types: a string that is exactly one placeholder becomes the source value with its own type (a number, an object, `null`);
 * a placeholder inside longer text becomes text. A missing value is `null` for the first and empty for the second.
 * `\{{` writes a literal `{{`.
 */

/** The most characters (and a rough node weight) one filled value may grow to. */
export const MAX_OUTPUT_CHARS = 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_SEGMENTS = 8;
const SEGMENT = /^[A-Za-z0-9_]{1,64}$/;
const INTEGER = /^-?\d{1,15}$/;
const BANNED = new Set(['__proto__', 'constructor', 'prototype']);
/** Request headers that never reach a response, whatever the template says. */
const PRIVATE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-tempo-access-key', 'x-tempo-token']);

export class PlaceholderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaceholderError';
  }
}

export interface PlaceholderContext {
  params?: Record<string, string> | undefined;
  query?: URLSearchParams | undefined;
  headers?: IncomingHttpHeaders | undefined;
  /** The parsed request body (called at most once). */
  body?: (() => unknown) | undefined;
  user?: { id: number; username: string } | undefined;
  now: () => Date;
  /** The `{{uuid}}` source: random, or seeded in test mode. */
  uuid: () => string;
  /** The value of `{{seq}}` for this request (the same for every use in one response). */
  seq: () => number;
  rng: Rng;
  /** Extra roots: `with` (a template reference's values), or `status`, `message` and `errors` in an error template. */
  vars?: Record<string, unknown> | undefined;
  /** When set, a lone `{{body}}` is this (the endpoint's answer, inside the success wrapper), not the request body. */
  responseBody?: { value: unknown } | undefined;
}

type Filter = 'number' | undefined;
interface Token {
  path: string[];
  args: number[];
  filter: Filter;
}
type Piece = string | Token | null;

/** `null` marks a token that is not valid (it answers as a missing value). */
function parseToken(inner: string): Token | null {
  const [main = '', filter, ...rest] = inner.split('|');
  if (rest.length > 0 || (filter !== undefined && filter.trim() !== 'number')) return null;
  const [path = '', ...args] = main.trim().split(/\s+/);
  const segments = path.split('.');
  if (segments.length > MAX_SEGMENTS || segments.some((segment) => !SEGMENT.test(segment) || BANNED.has(segment))) return null;
  if (args.length > 2 || args.some((arg) => !INTEGER.test(arg))) return null;
  return { path: segments, args: args.map(Number), filter: filter === undefined ? undefined : 'number' };
}

/** Cuts a string into literal text and tokens. An unclosed `{{` stays text. */
export function tokenize(text: string): Piece[] {
  const pieces: Piece[] = [];
  let literal = '';
  let at = 0;
  while (at < text.length) {
    if (text.startsWith('\\{{', at)) {
      literal += '{{';
      at += 3;
    } else if (text.startsWith('{{', at)) {
      const end = text.indexOf('}}', at + 2);
      if (end < 0) {
        literal += text.slice(at);
        break;
      }
      if (literal !== '') pieces.push(literal);
      literal = '';
      pieces.push(parseToken(text.slice(at + 2, end)));
      at = end + 2;
    } else {
      literal += text[at];
      at += 1;
    }
  }
  if (literal !== '') pieces.push(literal);
  return pieces;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Follows `segments` through own properties of objects and indexes of arrays only. */
function walk(value: unknown, segments: readonly string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d{1,9}$/.test(segment) || Number(segment) >= current.length) return undefined;
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else return undefined;
  }
  return current;
}

function fakeValue(kind: string | undefined, rng: Rng): string | undefined {
  switch (kind) {
    case 'name':
      return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    case 'email':
      return `${rng.pick(WORDS)}.${rng.hex(4)}@example.com`;
    case 'sentence': {
      const words = Array.from({ length: rng.int(5, 9) }, () => rng.pick(WORDS));
      return `${words.join(' ').replace(/^./, (first) => first.toUpperCase())}.`;
    }
    default:
      return undefined;
  }
}

function lookup(token: Token, ctx: PlaceholderContext): unknown {
  const [root, ...rest] = token.path;
  switch (root) {
    case 'params':
      return rest.length === 1 && ctx.params !== undefined && Object.hasOwn(ctx.params, rest[0] ?? '') ? ctx.params[rest[0] ?? ''] : undefined;
    case 'query':
      return rest.length === 1 ? (ctx.query?.get(rest[0] ?? '') ?? undefined) : undefined;
    case 'headers': {
      // `x_request_id` reads the header `x-request-id`: a header name has dashes, a path segment cannot.
      const name = rest.length === 1 ? (rest[0] ?? '').toLowerCase().replaceAll('_', '-') : '';
      if (name === '' || PRIVATE_HEADERS.has(name) || isSensitiveKey(name)) return undefined;
      const value = ctx.headers?.[name];
      return Array.isArray(value) ? value[0] : value;
    }
    case 'body':
      if (rest.length === 0 && ctx.responseBody !== undefined) return ctx.responseBody.value;
      return walk(ctx.body?.(), rest);
    case 'user':
      return rest.length === 1 && (rest[0] === 'id' || rest[0] === 'username') ? ctx.user?.[rest[0]] : undefined;
    case 'now':
      if (rest.length === 0 || (rest.length === 1 && rest[0] === 'iso')) return ctx.now().toISOString();
      return rest.length === 1 && rest[0] === 'unix' ? Math.floor(ctx.now().getTime() / 1000) : undefined;
    case 'uuid':
      return rest.length === 0 ? ctx.uuid() : undefined;
    case 'seq':
      return rest.length === 0 ? ctx.seq() : undefined;
    case 'random': {
      if (rest.length !== 1 || rest[0] !== 'int') return undefined;
      const [a = 0, b = 100] = token.args;
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      return ctx.rng.int(low, high);
    }
    case 'fake':
      return rest.length === 1 ? fakeValue(rest[0], ctx.rng) : undefined;
    default:
      return root !== undefined && ctx.vars !== undefined && Object.hasOwn(ctx.vars, root) ? walk(ctx.vars[root], rest) : undefined;
  }
}

function valueOf(token: Token | null, ctx: PlaceholderContext): unknown {
  if (token === null) return undefined;
  const value = lookup(token, ctx);
  if (token.filter === 'number') {
    const asNumber = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
    return Number.isFinite(asNumber) ? asNumber : undefined;
  }
  return value;
}

function asText(value: unknown, budget: Budget): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  budget.spend(0);
  return JSON.stringify(value) ?? '';
}

class Budget {
  private left = MAX_OUTPUT_CHARS;
  spend(chars: number): void {
    this.left -= chars + 4;
    if (this.left < 0) throw new PlaceholderError(`The response is larger than ${String(MAX_OUTPUT_CHARS)} characters once its placeholders are filled.`);
  }
}

function fillString(text: string, ctx: PlaceholderContext, budget: Budget): unknown {
  if (!text.includes('{{')) {
    budget.spend(text.length);
    return text;
  }
  const pieces = tokenize(text);
  const only = pieces.length === 1 ? pieces[0] : undefined;
  if (only !== undefined && typeof only !== 'string') {
    // A string that is one placeholder keeps the type of its value; missing is null.
    const value = valueOf(only, ctx);
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') budget.spend(value.length);
    else if (typeof value === 'object') budget.spend(JSON.stringify(value)?.length ?? 0);
    else budget.spend(8);
    return value;
  }
  let out = '';
  for (const piece of pieces) {
    out += typeof piece === 'string' ? piece : asText(valueOf(piece, ctx), budget);
    budget.spend(0);
    if (out.length > MAX_OUTPUT_CHARS) throw new PlaceholderError(`The response is larger than ${String(MAX_OUTPUT_CHARS)} characters once its placeholders are filled.`);
  }
  budget.spend(out.length);
  return out;
}

function fillValue(value: unknown, ctx: PlaceholderContext, budget: Budget, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new PlaceholderError('The value is nested too deeply.');
  if (typeof value === 'string') return fillString(value, ctx, budget);
  if (Array.isArray(value)) {
    budget.spend(0);
    return value.map((item) => fillValue(item, ctx, budget, depth + 1));
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      budget.spend(key.length);
      // `defineProperty`, not assignment: a key named `__proto__` becomes a plain property, never the prototype.
      Object.defineProperty(out, key, { value: fillValue(child, ctx, budget, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  budget.spend(8);
  return value;
}

/** Fills every placeholder in a JSON value (keys are left alone). Throws `PlaceholderError` when the result would be too large. */
export function fill(value: unknown, ctx: PlaceholderContext): unknown {
  return fillValue(value, ctx, new Budget(), 0);
}

/** Fills the placeholders in one piece of text as text (for header values). Control characters are removed. */
export function fillText(text: string, ctx: PlaceholderContext): string {
  const budget = new Budget();
  let out = '';
  for (const piece of tokenize(text)) out += typeof piece === 'string' ? piece : asText(valueOf(piece, ctx), budget);
  budget.spend(out.length);
  // A header value must never carry a line break (header injection), so control characters go.
  return out.replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Whether a value holds any placeholder at all (so plain bodies skip the work). */
export function hasPlaceholders(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === 'string') return value.includes('{{') || value.includes('\\{{');
  if (Array.isArray(value)) return value.some((item) => hasPlaceholders(item, depth + 1));
  if (isRecord(value)) return Object.values(value).some((item) => hasPlaceholders(item, depth + 1));
  return false;
}
