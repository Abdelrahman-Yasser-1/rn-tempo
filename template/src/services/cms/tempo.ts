import { z } from 'zod';

import { ENV } from '@config/env';
import { httpClient, resolveBaseUrl } from '@services/http/client';
import { ApiError } from '@services/http/errors';

import { CmsEntryError, parseCmsEntries, parseCmsEntry } from './schemas';
import type { CmsClient, CmsEntriesParams } from './types';

// The local backend serves its content under /content. CMS_BASE_URL defaults to API_BASE_URL; a backend that serves
// content under a prefix sets CMS_BASE_URL=https://host/api/v1.
const CONTENT_PATH = '/content';
const MAX_CACHED_URLS = 50;
const FALLBACK_LOCALE = 'en';

// A 400 problem+json whose first error points at the `locale` query parameter.
const localeProblem = z.object({
  errors: z.tuple([z.object({ path: z.literal('locale') })], z.unknown()),
});

// Insertion order is recency: a hit re-inserts its URL, the oldest URL is dropped past the bound.
const cache = new Map<string, { etag: string; body: unknown }>();

/**
 * Where content comes from. Without its own CMS_BASE_URL (it then equals API_BASE_URL) content follows the API,
 * including the dev menu's backend choice; an explicit CMS_BASE_URL always wins.
 */
export function contentBaseUrl(): string {
  return ENV.CMS_BASE_URL === ENV.API_BASE_URL ? resolveBaseUrl() : ENV.CMS_BASE_URL;
}

async function read(path: string, { locale, limit, cursor }: CmsEntriesParams): Promise<unknown> {
  // An absolute URL, because the shared client's interceptor sets `baseURL` to the API base on every request.
  const url = httpClient.getUri({
    baseURL: contentBaseUrl(),
    url: CONTENT_PATH + path,
    params: { locale, limit, cursor },
  });
  const cached = cache.get(url);
  if (cached) {
    cache.delete(url);
    cache.set(url, cached);
  }
  const response = await httpClient.get<unknown>(url, {
    // Content is public. `false` keeps the client's interceptor (which sets the bearer token without `rewrite`) from
    // adding Authorization: axios' AxiosHeaders.set skips an existing `false` and toJSON drops it.
    headers: { Authorization: false, 'If-None-Match': cached?.etag },
    skipAuthRefresh: true,
    validateStatus: (status) => status === 200 || (status === 304 && cached !== undefined),
  });
  if (response.status === 304 && cached) {
    return cached.body;
  }

  cache.delete(url);
  const etag: unknown = response.headers.etag;
  if (typeof etag === 'string') {
    cache.set(url, { etag, body: response.data });
    const oldest = cache.keys().next();
    if (cache.size > MAX_CACHED_URLS && !oldest.done) {
      cache.delete(oldest.value);
    }
  }
  return response.data;
}

async function readLocalized(path: string, params: CmsEntriesParams): Promise<unknown> {
  try {
    return await read(path, params);
  } catch (error) {
    const isUnknownLocale =
      params.locale !== FALLBACK_LOCALE &&
      error instanceof ApiError &&
      error.status === 400 &&
      localeProblem.safeParse(error.details).success;
    if (isUnknownLocale) {
      return read(path, { ...params, locale: FALLBACK_LOCALE });
    }
    throw error;
  }
}

/** Reads published entries from the Tempo local backend (or any server with the same content API). */
export const tempoClient: CmsClient = {
  /** Lists entries of a type. */
  async getEntries(type, params) {
    return parseCmsEntries(type, await readLocalized(`/${encodeURIComponent(type)}`, params));
  },
  /** Reads one entry by id or slug. */
  async getEntry(type, idOrSlug, params) {
    const path = `/${encodeURIComponent(type)}/${encodeURIComponent(String(idOrSlug))}`;
    try {
      return parseCmsEntry(type, await readLocalized(path, params));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new CmsEntryError('not-found');
      }
      throw error;
    }
  },
};
