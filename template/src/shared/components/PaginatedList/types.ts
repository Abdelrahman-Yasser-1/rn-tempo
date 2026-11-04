import type { ListRenderItem } from '@shopify/flash-list';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';

/** The part of a TanStack `useInfiniteQuery` result the list reads. */
export type PaginatedQuery<TPage> = Pick<
  UseInfiniteQueryResult<InfiniteData<TPage>>,
  | 'data'
  | 'error'
  | 'isPending'
  | 'isError'
  | 'isRefetching'
  | 'isPlaceholderData'
  | 'isFetchingNextPage'
  | 'hasNextPage'
  | 'fetchNextPage'
  | 'refetch'
>;

export type PaginatedListProps<TItem, TPage> = Readonly<{
  /** Result of `useInfiniteQuery`. */
  query: PaginatedQuery<TPage>;
  /** Items of one page; pages are concatenated in order. Keep the function stable. */
  getItems: (page: TPage) => readonly TItem[];
  renderItem: ListRenderItem<TItem>;
  keyExtractor: (item: TItem, index: number) => string;
  /** Shown when the list is empty; defaults to an EmptyState. */
  ListEmptyComponent?: ReactElement;
  /** Shown while the first page loads; defaults to a ListShimmer. */
  loadingComponent?: ReactElement;
  /** Parts: `${testID}.loading`, `.error`, `.empty`, `.loading-more` and `.list`. */
  testID?: string;
}>;
