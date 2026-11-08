import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type NotifyOnChangeProps,
} from '@tanstack/react-query';

import { fetchItem, fetchItems } from './items.api';
import { itemKeys } from './keys';

type QueryOptions = {
  /** Which result fields re-render the caller; screens pass `useFocusNotifyOnChangeProps()`. */
  notifyOnChangeProps?: NotifyOnChangeProps;
};

/** Pages of items for a search text (empty means all items), 20 per page. */
export function useItemsInfiniteQuery(q: string, { notifyOnChangeProps }: QueryOptions = {}) {
  return useInfiniteQuery({
    queryKey: itemKeys.list({ q }),
    queryFn: ({ pageParam }) => fetchItems({ q, skip: pageParam }),
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    notifyOnChangeProps,
    getNextPageParam: ({ skip, limit, total }) => (skip + limit < total ? skip + limit : undefined),
  });
}

/** One item by id. */
export function useItemQuery(id: number, { notifyOnChangeProps }: QueryOptions = {}) {
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: () => fetchItem(id),
    notifyOnChangeProps,
  });
}
