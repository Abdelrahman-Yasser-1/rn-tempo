import type { ContentFieldDef, ContentFieldType, ContentTypeDef, EntryDetail, EntryStatus, EntryValues } from '../api/types';

export const TYPE_WORDS: Record<ContentFieldType, string> = {
  string: 'Short text',
  text: 'Long text',
  richText: 'Markdown text',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
  enum: 'One of a list',
  media: 'Media file',
  json: 'JSON',
  list: 'List of texts',
};

export const STATUS_WORDS: Record<EntryStatus, string> = { draft: 'Draft', published: 'Published', scheduled: 'Scheduled' };

export const labelOf = (item: { name: string; label?: string }): string => (item.label !== undefined && item.label !== '' ? item.label : item.name);

/** The form of one locale: every field as text. A yes/no field is `'true'`, `'false'` or `''` (not set). */
export type LocaleForm = Record<string, string>;
export type EntryForm = Record<string, LocaleForm>;

function asText(field: ContentFieldDef, value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (field.type) {
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'list':
      return Array.isArray(value) ? value.map(String).join('\n') : '';
    case 'boolean':
      return value === true ? 'true' : value === false ? 'false' : '';
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}

export const blankLocale = (type: ContentTypeDef): LocaleForm => Object.fromEntries(type.fields.map((field) => [field.name, '']));

/** The editable form of an entry: one `LocaleForm` for each locale the type uses. */
export function entryToForm(type: ContentTypeDef, locales: string[], values: EntryValues): EntryForm {
  return Object.fromEntries(locales.map((locale) => [locale, Object.fromEntries(type.fields.map((field) => [field.name, asText(field, values[locale]?.[field.name])]))]));
}

export interface LocaleResult {
  /** The values to send; an empty field is left out, so clearing a field drops it. */
  data: Record<string, unknown>;
  problems: Record<string, string>;
}

/** Reads one locale's form. A value that cannot be read (a number that is not one, JSON that is not JSON) is a problem named by field. */
export function localeFromForm(type: ContentTypeDef, form: LocaleForm): LocaleResult {
  const data: Record<string, unknown> = {};
  const problems: Record<string, string> = {};
  for (const field of type.fields) {
    const raw = form[field.name] ?? '';
    const text = field.type === 'string' || field.type === 'text' || field.type === 'richText' || field.type === 'list' ? raw : raw.trim();
    if (text.trim() === '') continue;
    switch (field.type) {
      case 'number': {
        const number = Number(text);
        if (Number.isFinite(number)) data[field.name] = number;
        else problems[field.name] = 'Must be a number.';
        break;
      }
      case 'boolean':
        data[field.name] = text === 'true';
        break;
      case 'json':
        try {
          data[field.name] = JSON.parse(text) as unknown;
        } catch {
          problems[field.name] = 'Must be valid JSON.';
        }
        break;
      case 'list':
        data[field.name] = text
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item !== '');
        break;
      default:
        data[field.name] = text;
    }
  }
  return { data, problems };
}

/** Whether a locale form has nothing in it (a language nobody has translated yet). */
export const isBlankLocale = (form: LocaleForm | undefined): boolean => form === undefined || Object.values(form).every((value) => value.trim() === '');

export interface EntryBody {
  slug: string | null;
  values: Record<string, Record<string, unknown> | null>;
}

/**
 * What to send to save an entry: each locale's values (a locale that was saved and is now empty goes as `null`, so it
 * is removed), and the slug. `problems` is keyed `locale.field` and nothing is sent while it is not empty.
 */
export function entryBody(type: ContentTypeDef, locales: string[], form: EntryForm, slug: string, saved: EntryDetail | undefined): { body: EntryBody; problems: Record<string, string> } {
  const values: Record<string, Record<string, unknown> | null> = {};
  const problems: Record<string, string> = {};
  for (const locale of locales) {
    const result = localeFromForm(type, form[locale] ?? blankLocale(type));
    for (const [name, message] of Object.entries(result.problems)) problems[`${locale}.${name}`] = message;
    if (Object.keys(result.data).length > 0) values[locale] = result.data;
    else if (saved?.values[locale] !== undefined) values[locale] = null;
  }
  return { body: { slug: slug.trim() === '' ? null : slug.trim(), values }, problems };
}

/** Required fields (in the default locale) that are empty: publishing needs them. */
export function missingForPublish(type: ContentTypeDef, form: EntryForm, defaultLocale: string): string[] {
  const locale = form[defaultLocale];
  return type.fields.filter((field) => field.required === true && (locale?.[field.name] ?? '').trim() === '').map((field) => labelOf(field));
}

/** `2026-11-18T10:00:00.000Z` as the value of a `datetime-local` input (the viewer's time zone). */
export function toLocalInput(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The value of a `datetime-local` input as an ISO time, or `null` when it is empty or not a time. */
export function fromLocalInput(value: string): string | null {
  if (value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function whenText(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
