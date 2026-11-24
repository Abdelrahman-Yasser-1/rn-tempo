import { useInfiniteQuery, useQuery, type NotifyOnChangeProps } from '@tanstack/react-query';

import { useLanguage } from '@services/i18n/useLanguage';

import { getCmsClient } from './client';
import { cmsKeys } from './keys';
import type { CmsType } from './schemas';
import type { CmsId } from './types';

type QueryOptions = { notifyOnChangeProps?: NotifyOnChangeProps };

/** Loads cursor pages in the active app language. */
export function useCmsEntries<T extends CmsType>(
  type: T,
  { limit, notifyOnChangeProps }: QueryOptions & { limit?: number } = {},
) {
  const { language: locale } = useLanguage();
  return useInfiniteQuery({
    queryKey: cmsKeys.entries(type, { locale, limit }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getCmsClient().getEntries(type, { locale, limit, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    notifyOnChangeProps,
  });
}

/** Reads a localized entry by id or slug. */
export function useCmsEntry<T extends CmsType>(
  type: T,
  idOrSlug: CmsId,
  { notifyOnChangeProps }: QueryOptions = {},
) {
  const { language: locale } = useLanguage();
  return useQuery({
    queryKey: cmsKeys.entry(type, idOrSlug, locale),
    queryFn: () => getCmsClient().getEntry(type, idOrSlug, { locale }),
    notifyOnChangeProps,
  });
}
