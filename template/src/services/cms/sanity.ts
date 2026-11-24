import { ENV } from '@config/env';
import { httpClient } from '@services/http/client';

import { CmsEntryError, parseCmsEntries, parseCmsEntry } from './schemas';
import type { CmsClient, CmsEntriesParams } from './types';

// Sanity's public query API (read-only; the CDN serves only published content). URL, query parameters and response
// shape: https://www.sanity.io/docs/http-reference/query
// GET https://<projectId>.apicdn.sanity.io/v<YYYY-MM-DD>/data/query/<dataset>?query=<GROQ>&$name=<JSON value>
// answers { ms, query, result }.
const DEFAULT_API_VERSION = '2025-02-19';
const DEFAULT_PAGE_SIZE = 20;
const FALLBACK_LOCALE = 'en';

// Published documents only: `perspective=published` on the CDN, and `drafts.*` ids are excluded in GROQ as well.
const PUBLISHED = '_type == $type && !(_id in path("drafts.**"))';
const LIST_QUERY = `*[${PUBLISHED}] | order(coalesce(publishedAt, _updatedAt) desc)[$from...$to]`;
const ONE_QUERY = `*[${PUBLISHED} && (_id == $key || slug.current == $key)][0]`;

type Config = { projectId: string; dataset: string; apiVersion: string };

function readConfig(): Config {
  const { CMS_PROJECT_ID: projectId, CMS_DATASET: dataset } = ENV;
  if (!projectId || !dataset) {
    throw new Error('The sanity CMS adapter needs CMS_PROJECT_ID and CMS_DATASET');
  }
  return { projectId, dataset, apiVersion: ENV.CMS_API_VERSION ?? DEFAULT_API_VERSION };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

async function query(groq: string, params: Record<string, unknown>): Promise<unknown> {
  const { projectId, dataset, apiVersion } = readConfig();
  const search = new URLSearchParams({ query: groq, perspective: 'published' });
  // Parameter values are JSON, so a string is sent quoted.
  for (const [name, value] of Object.entries(params)) {
    search.set(`$${name}`, JSON.stringify(value));
  }
  const url = `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${encodeURIComponent(dataset)}`;
  const response = await httpClient.get<unknown>(`${url}?${search.toString()}`, {
    // Public data: no bearer token, and a Sanity error becomes an ApiError like any other.
    headers: { Authorization: false },
    skipAuthRefresh: true,
  });
  return isRecord(response.data) ? response.data.result : undefined;
}

/** A field-level object keyed by language, such as `title: { en, ar }`. */
function isLocalizedField(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && FALLBACK_LOCALE in value;
}

/** Picks the requested language from a localized field, else `en`; `isFallback` marks the `en` pick. */
function pickLocale(value: Record<string, unknown>, locale: string) {
  const isFallback = isBlank(value[locale]) && locale !== FALLBACK_LOCALE;
  return {
    picked: value[isFallback ? FALLBACK_LOCALE : locale],
    isFallback,
    codes: Object.keys(value).filter((code) => !isBlank(value[code])),
  };
}

/**
 * Maps a Sanity document to the shared envelope. Localized fields follow one convention: a field-level object keyed
 * by language (`title: { en, ar }`). The requested language wins, then `en`; a field filled from `en` is listed in
 * `fallbackFields`.
 */
function toEnvelope(doc: unknown, locale: string): unknown {
  if (!isRecord(doc)) {
    return doc;
  }
  const fields: Record<string, unknown> = {};
  const fallbackFields: string[] = [];
  const available = new Set<string>();
  const content = Object.entries(doc).filter(
    ([name]) => !name.startsWith('_') && name !== 'slug' && name !== 'publishedAt',
  );
  for (const [name, value] of content) {
    if (!isLocalizedField(value)) {
      fields[name] = value;
      continue;
    }
    const { picked, isFallback, codes } = pickLocale(value, locale);
    fields[name] = picked;
    for (const code of codes) {
      available.add(code);
    }
    if (isFallback) {
      fallbackFields.push(name);
    }
  }
  return {
    id: doc._id,
    slug: isRecord(doc.slug) && typeof doc.slug.current === 'string' ? doc.slug.current : null,
    type: doc._type,
    locale,
    availableLocales: [...available],
    fallbackFields,
    fields,
    updatedAt: doc._updatedAt,
    publishedAt: typeof doc.publishedAt === 'string' ? doc.publishedAt : null,
  };
}

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^\d{1,9}$/.test(cursor)) {
    throw new CmsEntryError('invalid');
  }
  return Number(cursor);
}

/** Reads published documents from Sanity's public GROQ API; nothing here needs a token. */
export const sanityClient: CmsClient = {
  /** Lists a page of documents; the cursor is the numeric offset of the next page, as a string. */
  async getEntries(type, { locale, limit = DEFAULT_PAGE_SIZE, cursor }: CmsEntriesParams) {
    const from = offsetOf(cursor);
    // One extra document tells whether another page exists.
    const result = await query(LIST_QUERY, { type, from, to: from + limit + 1 });
    const docs: unknown[] = Array.isArray(result) ? result : [];
    return parseCmsEntries(type, {
      items: docs.slice(0, limit).map((doc) => toEnvelope(doc, locale)),
      nextCursor: docs.length > limit ? String(from + limit) : null,
    });
  },
  /** Reads one document by `_id` or slug. */
  async getEntry(type, idOrSlug, { locale }) {
    const result = await query(ONE_QUERY, { type, key: String(idOrSlug) });
    return parseCmsEntry(type, toEnvelope(result, locale));
  },
};
