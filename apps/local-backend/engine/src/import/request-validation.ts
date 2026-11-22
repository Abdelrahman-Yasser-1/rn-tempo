import type { FieldIssue } from '@rn-tempo/api-contract';
import { z } from 'zod';

import type { RequestCtx } from '../http.ts';
import { problemReply, type Reply } from '../http.ts';
import type { RequestSchemasValue } from '../schema.ts';

type Schema = z.ZodType;
type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A JSON Schema as Zod, using Zod's own reader. A schema it cannot read gives `undefined`, so the part is not checked. */
export function jsonSchemaToZod(schema: unknown): Schema | undefined {
  if (!isObject(schema)) return undefined;
  try {
    return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    return undefined;
  }
}

const primaryType = (schema: Json): string | undefined => (Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : (schema.type as string | undefined));

/**
 * One value of a path or query string. These arrive as text, so numbers are coerced and booleans read `true` or
 * `false`; arrays take their items the same way. Everything else (strings, enums, formats) goes through Zod's reader.
 */
function textValue(schema: Json): Schema | undefined {
  const type = primaryType(schema);
  if (type === 'integer' || type === 'number') {
    let out = z.coerce.number();
    if (type === 'integer') out = out.int();
    if (typeof schema.minimum === 'number') out = out.min(schema.minimum);
    if (typeof schema.maximum === 'number') out = out.max(schema.maximum);
    if (Array.isArray(schema.enum)) {
      const allowed = new Set(schema.enum.map(Number));
      return out.refine((value) => allowed.has(value), { message: 'Invalid value.' });
    }
    return out;
  }
  if (type === 'boolean') return z.stringbool();
  if (type === 'array') {
    const items = isObject(schema.items) ? textValue(schema.items) : undefined;
    return z.array(items ?? z.string());
  }
  return jsonSchemaToZod(schema);
}

/** The object schema for path parameters or the query string. */
function textObject(schema: Json): Schema {
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const shape: Record<string, Schema> = {};
  for (const [name, raw] of Object.entries(properties)) {
    const value = textValue(isObject(raw) ? raw : {});
    if (value === undefined) continue;
    shape[name] = required.has(name) ? value : value.optional();
  }
  return z.object(shape);
}

export interface RequestValidator {
  /** The problems of this request, each with a path such as `body.name` or `query.limit`. Empty when it is fine. */
  check: (ctx: RequestCtx, params: Record<string, string>) => FieldIssue[] | Reply;
}

const toIssues = (prefix: string, error: z.ZodError): FieldIssue[] =>
  error.issues.map((issue) => ({ path: [prefix, ...issue.path.map(String)].join('.'), message: issue.message }));

/** Compiles the request schemas of an endpoint once. `undefined` when there is nothing that can be checked. */
export function buildRequestValidator(request: RequestSchemasValue | undefined): RequestValidator | undefined {
  if (request === undefined) return undefined;
  const params = request.params === undefined ? undefined : textObject(request.params);
  const query = request.query === undefined ? undefined : textObject(request.query);
  const body = jsonSchemaToZod(request.body);
  if (params === undefined && query === undefined && body === undefined) return undefined;
  const queryArrays = new Set(
    Object.entries(isObject(request.query?.properties) ? request.query.properties : {})
      .filter(([, schema]) => isObject(schema) && primaryType(schema) === 'array')
      .map(([name]) => name),
  );
  return {
    check(ctx, pathParams) {
      const issues: FieldIssue[] = [];
      if (params !== undefined) {
        const result = params.safeParse(pathParams);
        if (!result.success) issues.push(...toIssues('params', result.error));
      }
      if (query !== undefined) {
        const values: Record<string, unknown> = {};
        for (const key of new Set(ctx.query.keys())) values[key] = queryArrays.has(key) ? ctx.query.getAll(key).flatMap((entry) => entry.split(',')) : ctx.query.get(key);
        const result = query.safeParse(values);
        if (!result.success) issues.push(...toIssues('query', result.error));
      }
      if (body !== undefined) {
        const trimmed = ctx.bodyText.trim();
        if (trimmed === '') {
          if (request.bodyRequired === true) issues.push({ path: 'body', message: 'A JSON body is required.' });
        } else {
          let parsed: unknown;
          let readable = true;
          try {
            parsed = JSON.parse(trimmed) as unknown;
          } catch {
            readable = false;
            return problemReply(400, { detail: 'The request body is not valid JSON.' });
          }
          if (readable) {
            const result = body.safeParse(parsed);
            if (!result.success) issues.push(...toIssues('body', result.error));
          }
        }
      }
      return issues;
    },
  };
}

/** The 400 answer for a list of problems, naming the first in `detail` and every one in `errors`. */
export function invalidRequest(issues: FieldIssue[]): Reply {
  const first = issues[0];
  return problemReply(400, { detail: first === undefined ? 'The request is not valid.' : `${first.path}: ${first.message}`, errors: issues });
}
