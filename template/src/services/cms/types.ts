import type { CmsEntry, CmsPage, CmsType } from './schemas';

export type CmsEntriesParams = { locale: string; limit?: number; cursor?: string };
export type CmsId = CmsEntry['id'];

export type CmsClient = {
  getEntries<T extends CmsType>(type: T, params: CmsEntriesParams): Promise<CmsPage<T>>;
  getEntry<T extends CmsType>(
    type: T,
    idOrSlug: CmsId,
    params: { locale: string },
  ): Promise<CmsEntry<T>>;
};
