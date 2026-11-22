import { FORBIDDEN_HEADERS } from './constants.ts';
import { fill, fillText, PlaceholderError, type PlaceholderContext } from './placeholders.ts';
import type { Backend, Endpoint } from './schema.ts';

/**
 * The shared response shape of a backend: one wrapper for every success answer, one error format, common headers, and named
 * templates. Resolution order for an endpoint's success answer:
 *
 * 1. the endpoint's own body (static body, scenario body, or whatever the handler or collection produced; a
 *    `{ "template": "name", "with": { ... } }` body is first expanded from `responseTemplates`);
 * 2. the wrapper: `endpoint.wrap` is `"none"` (no wrapper), a template name (that template's body is the wrapper), or
 *    `"inherit"` / absent (the backend's `responses.success`);
 * 3. headers: backend `responses.headers`, then the template's, then the endpoint's `headers`, then the scenario's.
 *
 * Errors the engine itself produces (400, 401, 404, 405, 429 ...) use `responses.error`.
 */

export const TEMPLATE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** `wrap` values that are not template names. */
export const WRAP_KEYWORDS = ['inherit', 'none'] as const;
const BODY_TOKEN = /^\{\{\s*body\s*\}\}$/;

export interface TemplateRef {
  template: string;
  with?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{ "template": "name" }` or `{ "template": "name", "with": { ... } }` and nothing else: a body that uses a template. */
export function isTemplateRef(value: unknown): value is TemplateRef {
  if (!isRecord(value) || typeof value.template !== 'string') return false;
  return Object.keys(value).every((key) => key === 'template' || key === 'with') && (value.with === undefined || isRecord(value.with));
}

/** Whether a wrapper holds a whole-string `{{body}}` somewhere (the place the endpoint's body goes). */
export function containsBodyToken(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (typeof value === 'string') return BODY_TOKEN.test(value);
  if (Array.isArray(value)) return value.some((item) => containsBodyToken(item, depth + 1));
  if (isRecord(value)) return Object.values(value).some((item) => containsBodyToken(item, depth + 1));
  return false;
}

/** Every template name a body refers to (it is checked against `responseTemplates` when a definition loads). */
export function templateNamesIn(body: unknown): string[] {
  return isTemplateRef(body) ? [body.template] : [];
}

type Templates = Backend['responseTemplates'];
export interface ExpandedTemplate {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

/**
 * The body of a template reference with `{{with.x}}` (and every other placeholder) filled. A body that is not a reference
 * comes back unchanged with no status or headers. A reference to a missing template answers with the name in the error.
 */
export function expandTemplate(body: unknown, templates: Templates, ctx: PlaceholderContext): ExpandedTemplate {
  if (!isTemplateRef(body)) return { body };
  const found = Object.hasOwn(templates, body.template) ? templates[body.template] : undefined;
  if (found === undefined) throw new PlaceholderError(`There is no response template named "${body.template}".`);
  // The `with` values may use the request's placeholders (`"id": "{{params.id}}"`); the result is data, never filled again.
  const inner = { ...ctx, vars: { ...ctx.vars, with: fill(body.with ?? {}, ctx) } };
  return { ...(found.status === undefined ? {} : { status: found.status }), ...(found.headers === undefined ? {} : { headers: cleanHeaders(found.headers, inner) }), body: fill(found.body, inner) };
}

/**
 * Header names the engine may send (lower-cased; hop-by-hop ones and anything that is not a plain token are dropped), with
 * the placeholders of each value filled when a context is given.
 */
export function cleanHeaders(headers: Record<string, string> | undefined, ctx?: PlaceholderContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const key = name.toLowerCase();
    if (/^[a-z0-9-]+$/.test(key) && !FORBIDDEN_HEADERS.has(key)) out[key] = ctx === undefined ? value : fillText(value, ctx);
  }
  return out;
}

/** The wrapper template an endpoint uses, or `undefined` for none. */
export function wrapperOf(definition: Pick<Backend, 'responses' | 'responseTemplates'>, endpoint: Pick<Endpoint, 'wrap'>): unknown {
  const wrap = endpoint.wrap ?? 'inherit';
  if (wrap === 'none') return undefined;
  if (wrap === 'inherit') return definition.responses?.success;
  return Object.hasOwn(definition.responseTemplates, wrap) ? definition.responseTemplates[wrap]?.body : undefined;
}

/** The wrapper with `{{body}}` replaced by the endpoint's body (kept as it is: its own `{{...}}` text is not filled again). */
export function wrapBody(wrapper: unknown, body: unknown, ctx: PlaceholderContext): unknown {
  return fill(wrapper, { ...ctx, responseBody: { value: body } });
}

/** What the engine's own error answers look like under each format. */
export interface ProblemParts {
  status: number;
  message: string;
  errors: unknown[];
}

/** The body of an engine error under the `dummyjson` or `custom` format; `undefined` keeps the problem+json body. */
export function errorBody(definition: Pick<Backend, 'responses'>, parts: ProblemParts, ctx: PlaceholderContext): unknown {
  const error = definition.responses?.error;
  if (error === undefined || error.format === 'problem') return undefined;
  if (error.format === 'dummyjson') return { message: parts.message };
  if (error.template === undefined) return undefined;
  return fill(error.template, { ...ctx, vars: { ...ctx.vars, status: parts.status, message: parts.message, errors: parts.errors } });
}
