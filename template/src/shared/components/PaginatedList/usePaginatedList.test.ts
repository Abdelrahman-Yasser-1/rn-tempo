import type { InfiniteData } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import type { PaginatedQuery } from './types';
import { usePaginatedList } from './usePaginatedList';

type Page = Readonly<{ rows: readonly string[] }>;

const getItems = (page: Page) => page.rows;

function makeQuery(overrides: Partial<PaginatedQuery<Page>> = {}): PaginatedQuery<Page> {
  const data: InfiniteData<Page> = {
    pages: [{ rows: ['a', 'b'] }, { rows: ['c'] }],
    pageParams: [0, 1],
  };
  return {
    data,
    error: null,
    isPending: false,
    isError: false,
    isRefetching: false,
    isPlaceholderData: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  };
}

describe('usePaginatedList', () => {
  it('flattens the pages in order', async () => {
    const { result } = await renderHook(() => usePaginatedList({ query: makeQuery(), getItems }));
    expect(result.current.items).toEqual(['a', 'b', 'c']);
  });

  it('has no items before any page arrives', async () => {
    const { result } = await renderHook(() =>
      usePaginatedList({ query: makeQuery({ data: undefined }), getItems }),
    );
    expect(result.current.items).toEqual([]);
  });

  it('pages only when there is a next page and none is loading', async () => {
    const fetchNextPage = jest.fn();
    const { result, rerender } = await renderHook(
      ({ query }: { query: PaginatedQuery<Page> }) => usePaginatedList({ query, getItems }),
      { initialProps: { query: makeQuery({ fetchNextPage }) } },
    );
    result.current.onEndReached();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    await rerender({ query: makeQuery({ fetchNextPage, hasNextPage: false }) });
    result.current.onEndReached();
    await rerender({ query: makeQuery({ fetchNextPage, isFetchingNextPage: true }) });
    result.current.onEndReached();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('refetches on refresh', async () => {
    const refetch = jest.fn();
    const { result } = await renderHook(() =>
      usePaginatedList({ query: makeQuery({ refetch }), getItems }),
    );
    result.current.onRefresh();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('reports a pull to refresh as refreshing', async () => {
    const { result } = await renderHook(() =>
      usePaginatedList({ query: makeQuery({ isRefetching: true }), getItems }),
    );
    expect(result.current.isRefreshing).toBe(true);
  });

  it('does not report paging as refreshing', async () => {
    const { result } = await renderHook(() =>
      usePaginatedList({
        query: makeQuery({ isRefetching: true, isFetchingNextPage: true }),
        getItems,
      }),
    );
    expect(result.current.isRefreshing).toBe(false);
  });

  it('does not report a search switching placeholder data as refreshing', async () => {
    const { result } = await renderHook(() =>
      usePaginatedList({
        query: makeQuery({ isRefetching: true, isPlaceholderData: true }),
        getItems,
      }),
    );
    expect(result.current.isRefreshing).toBe(false);
  });

  it('is not refreshing when idle', async () => {
    const { result } = await renderHook(() => usePaginatedList({ query: makeQuery(), getItems }));
    expect(result.current.isRefreshing).toBe(false);
  });
});
