/**
 * The matching of WebSocket rules. There are no regular expressions here on purpose: a pattern written in backend.json runs
 * against whatever a client sends, so a crafted one could freeze the server (ReDoS), and the engine already drops `pattern`
 * from imported schemas for the same reason. A rule matches with `type`, `jsonPath`, `equals`, `contains`, `startsWith` and
 * `endsWith`; every one of them runs in time proportional to the message.
 */

export interface RuleMatch {
  /** The message is a JSON object whose `type` field is this. */
  type?: string | undefined;
  /** A path into the JSON message: `$.user.name`, `$.items[0].id`, `$['a b']`. Alone, it matches when the value exists. */
  jsonPath?: string | undefined;
  /** The value (at `jsonPath`, or the whole message) is deeply equal to this. */
  equals?: unknown;
  /** The text (at `jsonPath`, or the whole message) contains this. */
  contains?: string | undefined;
  startsWith?: string | undefined;
  endsWith?: string | undefined;
}

export interface IncomingMessage {
  text: string;
  /** The parsed JSON, when the text is JSON. */
  json: { value: unknown } | undefined;
}

const MAX_PATH_CHARS = 200;
const MAX_PATH_SEGMENTS = 20;
const MAX_COMPARE_DEPTH = 32;

/** The segments of a JSON path, or `undefined` when the path is not one of the supported forms. */
export function parseJsonPath(path: string): (string | number)[] | undefined {
  if (path.length > MAX_PATH_CHARS || !path.startsWith('$')) return undefined;
  const segments: (string | number)[] = [];
  let at = 1;
  while (at < path.length) {
    const char = path[at];
    if (char === '.') {
      let end = at + 1;
      while (end < path.length && /[A-Za-z0-9_$-]/.test(path[end] ?? '')) end += 1;
      if (end === at + 1) return undefined;
      segments.push(path.slice(at + 1, end));
      at = end;
    } else if (char === '[') {
      const close = path.indexOf(']', at);
      if (close < 0) return undefined;
      const inner = path.slice(at + 1, close);
      if (/^\d{1,9}$/.test(inner)) segments.push(Number(inner));
      else if (/^'[^']{1,100}'$/.test(inner) || /^"[^"]{1,100}"$/.test(inner)) segments.push(inner.slice(1, -1));
      else return undefined;
      at = close + 1;
    } else return undefined;
    if (segments.length > MAX_PATH_SEGMENTS) return undefined;
  }
  return segments;
}

/** The value at a path, following own properties and array indexes only (never a prototype). */
export function readJsonPath(value: unknown, segments: readonly (string | number)[]): { found: boolean; value?: unknown } {
  let current = value;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false };
      current = current[segment];
    } else if (typeof current === 'object' && current !== null && !Array.isArray(current) && Object.hasOwn(current, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else return { found: false };
  }
  return { found: true, value: current };
}

export function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (depth > MAX_COMPARE_DEPTH) return false;
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => deepEqual(item, b[index], depth + 1));
  const left = Object.entries(a);
  const right = b as Record<string, unknown>;
  return left.length === Object.keys(right).length && left.every(([key, item]) => Object.hasOwn(right, key) && deepEqual(item, right[key], depth + 1));
}

/** The text a string condition looks at: a string value as is, a number or boolean as text, anything else not at all. */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
}

/** Whether a message satisfies every condition of a rule. A rule with no condition matches nothing (the schema refuses it). */
export function matchesRule(match: RuleMatch, message: IncomingMessage): boolean {
  let conditions = 0;
  const parsedPath = match.jsonPath === undefined ? undefined : parseJsonPath(match.jsonPath);
  if (match.jsonPath !== undefined && parsedPath === undefined) return false;
  // What the conditions look at: the value at the path, or the whole message.
  let target: { found: boolean; value?: unknown };
  if (parsedPath !== undefined) target = message.json === undefined ? { found: false } : readJsonPath(message.json.value, parsedPath);
  else target = { found: true, value: message.json === undefined ? message.text : message.json.value };
  if (match.jsonPath !== undefined) {
    conditions += 1;
    if (!target.found) return false;
  }
  if (match.type !== undefined) {
    conditions += 1;
    const json = message.json?.value;
    if (typeof json !== 'object' || json === null || Array.isArray(json) || (json as Record<string, unknown>).type !== match.type) return false;
  }
  if ('equals' in match) {
    conditions += 1;
    if (!deepEqual(target.value, match.equals)) return false;
  }
  // Text conditions look at the raw text of the whole message, or at the string at the path.
  const text = parsedPath === undefined ? message.text : textOf(target.value);
  for (const [key, test] of [
    ['contains', (value: string, needle: string): boolean => value.includes(needle)],
    ['startsWith', (value: string, needle: string): boolean => value.startsWith(needle)],
    ['endsWith', (value: string, needle: string): boolean => value.endsWith(needle)],
  ] as const) {
    const needle = match[key];
    if (needle === undefined) continue;
    conditions += 1;
    if (text === undefined || !test(text, needle)) return false;
  }
  return conditions > 0;
}
