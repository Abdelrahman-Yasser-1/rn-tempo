import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchItem, fetchItems } from './items.api';
import { itemKeys } from './keys';

/** Pages of items for a search text (empty means all items), 20 per page. */
export function useItemsInfiniteQuery(q: string) {
  return useInfiniteQuery({
    queryKey: itemKeys.list({ q }),
    queryFn: ({ pageParam }) => fetchItems({ q, skip: pageParam }),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    getNextPageParam: ({ skip, limit, total }) => (skip + limit < total ? skip + limit : undefined),
  });
}

export function useItemQuery(id: number) {
  return useQuery({ queryKey: itemKeys.detail(id), queryFn: () => fetchItem(id) });
}
