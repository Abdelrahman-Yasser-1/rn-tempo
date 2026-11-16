/** Normalized key names (lowercase, letters and digits) whose values must never reach a log. */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'xtempotoken',
  'secret',
  'apikey',
  'otp',
  'code',
  'email',
  'phone',
  'phonenumber',
]);

export const REDACTED = '[REDACTED]';

const normalize = (key: string): string => key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

/** True when a header, query or body key holds something private. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalize(key));
}

/**
 * Copies a value with every sensitive key replaced, at any depth. Pino's own `redact` only reaches
 * fixed paths, and request bodies are arbitrary, so bodies and headers go through this first.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, isSensitiveKey(key) ? REDACTED : redactDeep(child, depth + 1)]),
    );
  }
  return value;
}

/** Keeps the path of a URL and redacts the values of sensitive query parameters. */
export function redactUrl(url: string): string {
  const index = url.indexOf('?');
  if (index < 0) return url;
  const params = new URLSearchParams(url.slice(index + 1));
  for (const key of [...params.keys()]) if (isSensitiveKey(key)) params.set(key, REDACTED);
  return `${url.slice(0, index)}?${params.toString()}`;
}
