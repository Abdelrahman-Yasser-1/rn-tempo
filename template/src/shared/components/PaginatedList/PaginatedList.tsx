import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@shared/components/EmptyState';
import { ErrorState } from '@shared/components/ErrorState';
import { ListLoadingMore } from '@shared/components/ListLoadingMore';
import { ListShimmer } from '@shared/components/ListShimmer';

import type { PaginatedListProps } from './types';
import { usePaginatedList } from './usePaginatedList';

/**
 * FlashList over the pages of a TanStack `useInfiniteQuery`: a shimmer for the first load, an
 * error state with retry, an empty state, a footer spinner while the next page loads, paging at
 * the end of the list and pull-to-refresh.
 */
export function PaginatedList<TItem, TPage>({
  query,
  getItems,
  renderItem,
  keyExtractor,
  ListEmptyComponent,
  loadingComponent,
  testID,
}: PaginatedListProps<TItem, TPage>) {
  const { t } = useTranslation();
  const { items, isRefreshing, onEndReached, onRefresh } = usePaginatedList({ query, getItems });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  if (query.isPending) {
    return loadingComponent ?? <ListShimmer testID={suffix('loading')} />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={onRefresh} testID={suffix('error')} />;
  }

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      testID={suffix('list')}
      ListEmptyComponent={
        ListEmptyComponent ?? (
          <EmptyState title={t(($) => $.paginatedList.emptyTitle)} testID={suffix('empty')} />
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? <ListLoadingMore testID={suffix('loading-more')} /> : null
      }
    />
  );
}
