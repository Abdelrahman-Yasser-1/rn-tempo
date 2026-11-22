import type { JsonSchema } from '../api/types';

/**
 * Dynamic values in a response: `{{params.id}}`, `{{now}}`, `{{random.int 1 100}}` ... (see the help in the endpoint form).
 * The editor shows them in their own colour and never flags them, even where the schema expects a number: a whole-string
 * placeholder keeps the type of the value it is replaced by.
 */

/** The placeholders the engine understands, for the help popover. */
export const PLACEHOLDER_HELP: { token: string; meaning: string }[] = [
  { token: '{{params.id}}', meaning: 'A path parameter, such as the :id of /products/:id (text; add | number for a number).' },
  { token: '{{query.q}}', meaning: 'A query string value.' },
  { token: '{{body.user.name}}', meaning: 'A value of the JSON request body (keeps its type).' },
  { token: '{{headers.x_request_id}}', meaning: 'A request header (x_request_id reads x-request-id). Never authorization or cookie.' },
  { token: '{{user.id}}', meaning: 'The signed-in app user ({{user.username}} too), on endpoints that need sign-in.' },
  { token: '{{now}}', meaning: 'The current time as ISO text. {{now.unix}} is a number of seconds.' },
  { token: '{{uuid}}', meaning: 'A new unique id.' },
  { token: '{{seq}}', meaning: 'A counter of the requests this endpoint has had (1, 2, 3 ...).' },
  { token: '{{random.int 1 100}}', meaning: 'A whole number from 1 to 100.' },
  { token: '{{fake.name}}', meaning: 'A made-up name. {{fake.email}} and {{fake.sentence}} work too.' },
  { token: '{{with.x}}', meaning: 'In a response template: a value passed with "with".' },
  { token: '\\{{', meaning: 'Write \\{{ to show a literal {{ .' },
];

export interface TextRange {
  from: number;
  to: number;
}

/** Where the `{{ ... }}` tokens are in a text. A token after a backslash (`\{{`) is an escaped literal and is skipped. */
export function placeholderRanges(text: string): TextRange[] {
  const out: TextRange[] = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf('{{', at);
    if (open < 0) break;
    if (open > 0 && text[open - 1] === '\\') {
      at = open + 2;
      continue;
    }
    const close = text.indexOf('}}', open + 2);
    if (close < 0) break;
    const inner = text.slice(open + 2, close);
    if (inner.includes('{') || inner.includes('\n')) {
      // `{{{x}}`: the real token starts one brace later.
      at = open + 1;
      continue;
    }
    out.push({ from: open, to: close + 2 });
    at = close + 2;
  }
  return out;
}

export const isPlaceholderText = (value: unknown): value is string => typeof value === 'string' && /^\{\{[^{}]*\}\}$/.test(value.trim());

const PLACEHOLDER_STRING: JsonSchema = { type: 'string', pattern: '^\\s*\\{\\{[^{}]*\\}\\}\\s*$' };
const isObject = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A node that accepts any string, so a placeholder needs no help. */
const plainString = (schema: JsonSchema): boolean => Object.keys(schema).every((key) => key === 'type' || key === 'description' || key === 'title') && schema.type === 'string';

function widen(schema: unknown, root: boolean): unknown {
  if (!isObject(schema)) return schema;
  const next: JsonSchema = { ...schema };
  for (const key of ['properties', 'patternProperties', 'definitions', '$defs'] as const) {
    const group = next[key];
    if (isObject(group)) next[key] = Object.fromEntries(Object.entries(group).map(([name, child]) => [name, widen(child, false)]));
  }
  for (const key of ['items', 'additionalProperties', 'contains'] as const) {
    const child = next[key];
    if (Array.isArray(child)) next[key] = child.map((item) => widen(item, false));
    else if (isObject(child)) next[key] = widen(child, false);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const list = next[key];
    if (Array.isArray(list)) next[key] = list.map((item) => widen(item, false));
  }
  if (root || plainString(next) || Object.keys(next).length === 0) return next;
  return { anyOf: [next, PLACEHOLDER_STRING] };
}

/**
 * The schema with a placeholder accepted wherever a value is: each property, item and branch becomes "the original, or a string
 * that is exactly one `{{...}}`". The engine replaces such a string by a value of any type, so it is valid whatever the schema says.
 */
export function allowPlaceholders(schema: JsonSchema): JsonSchema {
  return widen(schema, true) as JsonSchema;
}

/** Whether a wrapper holds a string that is exactly `{{body}}` (where the endpoint's body goes). */
export function hasBodySlot(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (typeof value === 'string') return /^\{\{\s*body\s*\}\}$/.test(value);
  if (Array.isArray(value)) return (value as unknown[]).some((item) => hasBodySlot(item, depth + 1));
  if (typeof value === 'object' && value !== null) return Object.values(value).some((item) => hasBodySlot(item, depth + 1));
  return false;
}

export const TEMPLATE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const DEFAULT_WRAPPER = '{\n  "success": true,\n  "data": "{{body}}",\n  "message": null\n}';
export const DEFAULT_ERROR_TEMPLATE = '{\n  "success": false,\n  "status": "{{status}}",\n  "message": "{{message}}",\n  "errors": "{{errors}}"\n}';
