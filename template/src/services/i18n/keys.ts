import type { SelectorKey } from 'i18next';

/**
 * The one place a key that reaches the code as plain text becomes a key `t()` accepts. Use it for
 * keys that travel as data, like the message of a Zod issue (`error.message` in a form field).
 * Produce such keys with `keyFromSelector` from `i18next`, never as string literals, so they stay
 * type-checked against the locale files.
 */
export function toKey(message: string): SelectorKey {
  // The cast is the point: the string was made by `keyFromSelector`, which TypeScript cannot see.
  return message as SelectorKey;
}
