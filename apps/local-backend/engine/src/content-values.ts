import type { ContentField, ContentType } from './schema.ts';
import { ISO_DATE, isPlainObject } from './values.ts';

/** One invalid value of a content request, with a path like `values.en.title`. */
export interface ContentIssue {
  path: string;
  message: string;
}

/** Longest value of each text kind (characters). Keeps one entry from filling the database by accident. */
const MAX_LENGTH = { string: 2_000, text: 200_000, richText: 1_000_000 } as const;
const MAX_LIST_ITEMS = 500;
const MAX_JSON_CHARS = 1_000_000;

export const SLUG_HELP = 'A slug uses letters, digits, "-" and "_" (at most 100 characters), starts with a letter or digit and is not only digits.';
export const isSlug = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value) && !/^\d+$/.test(value);

/** A value a translator has not filled in: nothing, an empty text or an empty list. */
export function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function tooLong(value: string, max: number): string | undefined {
  return value.length > max ? `Must be at most ${String(max)} characters.` : undefined;
}

/** Whether a value fits a content field's type. Media existence is checked separately. Returns the problem, or undefined. */
export function checkContentShape(field: ContentField, value: unknown): string | undefined {
  switch (field.type) {
    case 'string':
    case 'text':
    case 'richText':
      return typeof value === 'string' ? tooLong(value, MAX_LENGTH[field.type]) : 'Must be text.';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : 'Must be a number.';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Must be true or false.';
    case 'date':
      return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? undefined : 'Must be an ISO 8601 date, for example 2026-11-17 or 2026-11-17T10:00:00Z.';
    case 'enum':
      return typeof value === 'string' && (field.enumValues ?? []).includes(value) ? undefined : `Must be one of: ${(field.enumValues ?? []).join(', ')}.`;
    case 'media':
      return typeof value === 'string' && value.length > 0 && value.length <= 128 ? undefined : 'Must be a media id.';
    case 'json':
      try {
        const text = JSON.stringify(value);
        return text === undefined ? 'Must be valid JSON.' : tooLong(text, MAX_JSON_CHARS);
      } catch {
        return 'Must be valid JSON.';
      }
    case 'list':
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return 'Must be a list of text values.';
      if (value.length > MAX_LIST_ITEMS) return `Must have at most ${String(MAX_LIST_ITEMS)} items.`;
      return value.some((item: string) => item.length > MAX_LENGTH.string) ? `Each item must be at most ${String(MAX_LENGTH.string)} characters.` : undefined;
  }
}

export interface LocaleDataOptions {
  /** Does a media file with this id exist? Media fields are checked with it when given. */
  mediaExists?: (id: string) => boolean;
}

/**
 * Checks the values of one locale of an entry against the type's fields. `null` clears a field and is dropped from
 * the result. A required field may be empty here (a draft); publishing checks `missingRequired`.
 */
export function validateLocaleData(type: ContentType, data: unknown, part: string, options: LocaleDataOptions): { data: Record<string, unknown>; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  if (!isPlainObject(data)) return { data: {}, issues: [{ path: part, message: 'Send a JSON object.' }] };
  const fields = new Map(type.fields.map((field) => [field.name, field]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = fields.get(key);
    if (field === undefined) {
      issues.push({ path: `${part}.${key}`, message: `Unknown field "${key}".` });
      continue;
    }
    if (value === null) continue;
    const problem = checkContentShape(field, value);
    if (problem !== undefined) issues.push({ path: `${part}.${key}`, message: problem });
    else if (field.type === 'media' && options.mediaExists !== undefined && !options.mediaExists(value as string)) issues.push({ path: `${part}.${key}`, message: `No media with id ${String(value)}.` });
    else out[key] = value;
  }
  return { data: out, issues };
}

/** The required fields the data leaves empty. */
export const missingRequired = (type: ContentType, data: Record<string, unknown> | undefined): string[] =>
  type.fields.filter((field) => field.required && isBlankValue(data?.[field.name])).map((field) => field.name);
