import type { CmsType } from './schemas';
import type { CmsEntriesParams, CmsId } from './types';

export const cmsKeys = {
  all: ['cms'] as const,
  /** All cursor pages for this content type, locale and page size. */
  entries: (type: CmsType, params: Omit<CmsEntriesParams, 'cursor'>) =>
    [...cmsKeys.all, 'entries', type, params] as const,
  /** A single localized document, addressed by id or slug. */
  entry: (type: CmsType, idOrSlug: CmsId, locale: string) =>
    [...cmsKeys.all, 'entry', type, idOrSlug, locale] as const,
};
