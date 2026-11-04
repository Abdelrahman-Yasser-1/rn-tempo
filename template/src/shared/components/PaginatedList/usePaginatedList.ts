import { useMemo } from 'react';

import type { PaginatedListProps } from './types';

type UsePaginatedListParams<TItem, TPage> = Pick<
  PaginatedListProps<TItem, TPage>,
  'query' | 'getItems'
>;

/** Flattens the pages and wires paging and pull-to-refresh to the infinite query. */
export function usePaginatedList<TItem, TPage>({
  query,
  getItems,
}: UsePaginatedListParams<TItem, TPage>) {
  const { data, hasNextPage, isFetchingNextPage, isRefetching, isPlaceholderData } = query;
  const { fetchNextPage, refetch } = query;
  // Pass a stable `getItems` (module level or memoised) to keep the item list identity.
  const items = useMemo(
    () => data?.pages.flatMap((page) => getItems(page)) ?? [],
    [data, getItems],
  );

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  const onRefresh = () => {
    void refetch();
  };

  return {
    items,
    // A refetch that is neither paging nor a search switching placeholder data is a pull to refresh.
    isRefreshing: isRefetching && !isFetchingNextPage && !isPlaceholderData,
    onEndReached,
    onRefresh,
  };
}
