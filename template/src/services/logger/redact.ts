/** Replaces the whole value of a sensitive key, and masks sensitive tokens inside strings. */
export const REDACTED = '[REDACTED]';
/** Replaces anything nested deeper than {@link MAX_DEPTH}. */
export const DEPTH_MARK = '[Depth]';
/** Replaces an object that is already being visited higher up (a cycle). */
export const CIRCULAR_MARK = '[Circular]';
/** Replaces the raw request object attached to axios errors (huge, and holds the headers). */
export const REQUEST_MARK = '[Request]';

const MAX_DEPTH = 8;

/**
 * Keys whose whole value is replaced, wherever they appear. Matched against the key with `-`, `_`
 * and spaces removed, so `x-api-key`, `api_key` and `apiKey` all count. Over-matching (`author`,
 * `shipping`) only hides a harmless value; under-matching leaks a secret.
 */
const SENSITIVE_KEY =
  /token|secret|passw(?:or)?d|auth|cookie|signature|otp|pin|apikey|refresh|session|credential|privatekey|^sid$/i;
const KEY_SEPARATORS = /[\s_-]/g;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key.replaceAll(KEY_SEPARATORS, ''));
}

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /\bBearer\s+[^\s"',;]+/gi;
const EMAIL = /([\w.+-]{1,64})@([\w-]{1,63}(?:\.[\w-]{1,63}){1,8})/g;
/** `scheme://user:pass@host`: the credentials part of a URL. */
const URL_USERINFO = /\b([a-z][\d+.a-z-]*:\/\/)[^\s/?#@]+@/gi;
/** `?token=...`, `&password=...`, `#access_token=...`: the value of a sensitive query or form field. */
const SENSITIVE_PARAM =
  /([#&;?][^\s#&;=?]*(?:token|secret|passw|auth|code|otp|pin|key|sig|session|sid)[^\s#&;=?]*=)[^\s#&;]+/gi;

/**
 * Masks sensitive tokens inside free text: URL credentials and sensitive query values become
 * `[REDACTED]`, JWTs become `[REDACTED]`, `Bearer <x>` becomes `Bearer [REDACTED]`, and emails keep
 * their first letter and domain (`j***@x.com`).
 */
export function redactString(text: string): string {
  return text
    .replaceAll(URL_USERINFO, `$1${REDACTED}@`)
    .replaceAll(SENSITIVE_PARAM, `$1${REDACTED}`)
    .replaceAll(JWT, REDACTED)
    .replaceAll(BEARER, `Bearer ${REDACTED}`)
    .replaceAll(
      EMAIL,
      (_match: string, local: string, domain: string) => `${local.slice(0, 1)}***@${domain}`,
    );
}

function isAxiosLike(value: object): boolean {
  return 'isAxiosError' in value && value.isAxiosError === true;
}

type Walk = { depth: number; ancestors: WeakSet<object> };

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** A request config or a response of an axios error, at any depth: payloads are replaced whole. */
function redactAxiosPayload(source: object, walk: Walk): unknown {
  if (walk.depth >= MAX_DEPTH) {
    return DEPTH_MARK;
  }
  const next: Walk = { ...walk, depth: walk.depth + 1 };
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    result[name] = redactAxiosField(name, value, next);
  }
  return result;
}

function redactAxiosField(name: string, value: unknown, walk: Walk): unknown {
  if (name === 'data' || name === 'request') {
    return REDACTED;
  }
  return (name === 'config' || name === 'response') && isObject(value)
    ? redactAxiosPayload(value, walk)
    : redactKeyed(name, value, walk);
}

/** Properties of an axios error whose payload is replaced as a whole. */
function redactAxiosPart(key: string, value: unknown, walk: Walk): unknown {
  if (key === 'request') {
    return REQUEST_MARK;
  }
  return (key === 'config' || key === 'response') && isObject(value)
    ? redactAxiosPayload(value, walk)
    : redactKeyed(key, value, walk);
}

function redactKeyed(key: string, value: unknown, walk: Walk): unknown {
  return isSensitiveKey(key) ? REDACTED : redactValue(value, walk);
}

function redactEntries(source: object, walk: Walk, isAxios: boolean): Record<string, unknown> {
  const next: Walk = { ...walk, depth: walk.depth + 1 };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = isAxios ? redactAxiosPart(key, value, next) : redactKeyed(key, value, next);
  }
  return result;
}

function redactError(error: Error, walk: Walk): Error {
  const copy = new Error(redactString(error.message));
  copy.name = error.name;
  if (error.stack !== undefined) {
    copy.stack = redactString(error.stack);
  }
  if (error.cause !== undefined) {
    copy.cause = redactValue(error.cause, { ...walk, depth: walk.depth + 1 });
  }
  const extras = redactEntries(error, walk, isAxiosLike(error));
  for (const [key, value] of Object.entries(extras)) {
    Object.defineProperty(copy, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/**
 * Fails closed: anything that is not a known-safe value is walked. Maps keep their shape with
 * redacted entries, Sets become arrays, and other class instances become plain objects of their own
 * enumerable properties (an opaque object with none, like an ArrayBuffer, logs as `{}`).
 */
function redactObject(value: object, walk: Walk): unknown {
  const next: Walk = { ...walk, depth: walk.depth + 1 };
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactValue(item, next));
  }
  if (value instanceof Error) {
    return redactError(value, walk);
  }
  if (value instanceof Map) {
    return new Map(
      [...value.entries()].map(([key, item]: [unknown, unknown]) => [
        key,
        typeof key === 'string' ? redactKeyed(key, item, next) : redactValue(item, next),
      ]),
    );
  }
  return value instanceof Set
    ? [...value].map((item: unknown) => redactValue(item, next))
    : redactEntries(value, walk, isAxiosLike(value));
}

function redactValue(value: unknown, walk: Walk): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (walk.depth >= MAX_DEPTH) {
    return DEPTH_MARK;
  }
  if (walk.ancestors.has(value)) {
    return CIRCULAR_MARK;
  }
  walk.ancestors.add(value);
  try {
    return redactObject(value, walk);
  } finally {
    walk.ancestors.delete(value);
  }
}

/**
 * Deep-redacts log arguments before they reach any sink. Returns copies and never mutates the
 * input. Handles arrays, plain objects, errors (including axios errors), Maps, Sets, class
 * instances, cycles and a depth cap. Only Dates and RegExps pass through untouched.
 */
export function redact<T>(value: T): T {
  // The result mirrors the input shape; callers treat it as the same type.
  return redactValue(value, { depth: 0, ancestors: new WeakSet() }) as T;
}
