/** Normalized key names (lowercase, letters and digits) whose values must never reach a log. */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwordhash',
  'confirmpassword',
  'currentpassword',
  'newpassword',
  'tokenhash',
  'jwtsecret',
  'token',
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'xtempotoken',
  'secret',
  'apikey',
  'accesskey',
  'xtempoaccesskey',
  'totpsecret',
  'recoverycode',
  'recoverycodes',
  'setuptoken',
  'keyhash',
  'otp',
  'code',
  'email',
  'phone',
  'phonenumber',
]);

export const REDACTED = '[REDACTED]';

/** A Tempo API key (`tlb_...`) wherever it shows up in a text: a log line, a URL, a body value. */
const KEY_IN_TEXT = /\btlb_[A-Za-z0-9_-]{8,}/g;

/** Replaces any API key inside a text. */
export const scrubKeys = (text: string): string => text.replace(KEY_IN_TEXT, REDACTED);

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
  return typeof value === 'string' ? scrubKeys(value) : value;
}

/** Keeps the path of a URL and redacts the values of sensitive query parameters. */
export function redactUrl(url: string): string {
  const index = url.indexOf('?');
  if (index < 0) return scrubKeys(url);
  const params = new URLSearchParams(url.slice(index + 1));
  for (const key of [...params.keys()]) if (isSensitiveKey(key)) params.set(key, REDACTED);
  return scrubKeys(`${url.slice(0, index)}?${params.toString()}`);
}
