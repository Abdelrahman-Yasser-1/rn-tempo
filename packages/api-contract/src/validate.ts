import type { EndpointDefinition } from './types.ts';
import { issuesFromZod, problem, type FieldIssue, type ProblemDetails } from './problem.ts';

/** The raw request parts, as the HTTP layer received them. */
export interface RawRequest {
  params: unknown;
  query: unknown;
  body: unknown;
}

/** The request parts after parsing: coerced, defaulted and stripped like the schema says. */
export interface ParsedRequest {
  params: unknown;
  query: unknown;
  body: unknown;
}

export type ValidationResult =
  | { ok: true; value: ParsedRequest }
  | { ok: false; problem: ProblemDetails };

/**
 * Checks params, query and body against the endpoint's schemas. Every part is checked, so one
 * response lists all invalid fields. Parts without a schema pass through unchanged.
 */
export function validateRequest(
  endpoint: Pick<EndpointDefinition, 'params' | 'query' | 'body'>,
  raw: RawRequest,
): ValidationResult {
  const issues: FieldIssue[] = [];
  const value: ParsedRequest = { params: raw.params, query: raw.query, body: raw.body };

  for (const part of ['params', 'query', 'body'] as const) {
    const schema = endpoint[part];
    if (schema === undefined) continue;
    const result = schema.safeParse(raw[part]);
    if (result.success) value[part] = result.data;
    else issues.push(...issuesFromZod(part, result.error));
  }

  if (issues.length > 0) {
    return {
      ok: false,
      problem: problem(400, {
        title: 'Invalid request',
        detail: `${issues.length} field${issues.length === 1 ? '' : 's'} failed validation.`,
        errors: issues,
      }),
    };
  }
  return { ok: true, value };
}

/**
 * Checks a response value against the endpoint's response schema. Used by servers before they send
 * data, so a wrong `data` function fails loudly instead of reaching the app.
 */
export function validateResponse(
  endpoint: Pick<EndpointDefinition, 'response'>,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; issues: FieldIssue[] } {
  const result = endpoint.response.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: issuesFromZod('response', result.error) };
}
