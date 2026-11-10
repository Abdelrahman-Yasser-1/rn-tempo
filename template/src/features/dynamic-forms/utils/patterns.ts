import { VALIDATION_MESSAGES } from '@features/dynamic-forms/utils/messages';

/**
 * The patterns a server-driven form may ask for, by name. A document never carries regex
 * source: compiling a string from the network is a denial-of-service risk that no syntax check
 * can rule out. Each pattern here is written and reviewed in code. Rules for adding one:
 *
 * - anchored (`^...$`), built from single character classes with one quantifier each;
 * - no group followed by a quantifier, no alternation, no backreference, no lookaround;
 * - classes next to each other must not overlap in a way that lets the engine split the input
 *   more than one way.
 *
 * Add your own below; the name becomes valid in the `pattern` rule at once.
 */
export const PATTERNS = {
  digits: { regex: /^\d+$/, message: VALIDATION_MESSAGES.digits },
  letters: { regex: /^\p{L}+$/u, message: VALIDATION_MESSAGES.letters },
  alphanumeric: { regex: /^[\p{L}\p{N}]+$/u, message: VALIDATION_MESSAGES.alphanumeric },
  noSpaces: { regex: /^\S+$/u, message: VALIDATION_MESSAGES.noSpaces },
  postalCode: { regex: /^[A-Z0-9][A-Z0-9 -]{2,9}$/i, message: VALIDATION_MESSAGES.postalCode },
  iban: { regex: /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, message: VALIDATION_MESSAGES.iban },
} as const satisfies Record<string, { regex: RegExp; message: string }>;

export type PatternName = keyof typeof PATTERNS;

/** The names a document may use, for the format schema. */
export const PATTERN_NAMES = Object.keys(PATTERNS) as [PatternName, ...PatternName[]];
