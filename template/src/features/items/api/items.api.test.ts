import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { ITEMS_PAGE_SIZE } from '@features/items/constants';
import { useNetworkStore } from '@services/network/network';
import { server } from '@test-utils/msw/server';
import { createTestQueryClient } from '@test-utils/renderWithProviders';

import { fetchItems } from './items.api';
import { useItemsInfiniteQuery } from './queries';

const requested: string[] = [];

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  requested.length = 0;
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    requested.push(`${url.pathname}?${url.searchParams.toString()}`);
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

describe('fetchItems', () => {
  test('AC-4: an empty search text lists the catalog from /products', async () => {
    const page = await fetchItems({ q: '', skip: 0 });

    expect(requested).toEqual([`/products?limit=${String(ITEMS_PAGE_SIZE)}&skip=0`]);
    expect(page.products).toHaveLength(ITEMS_PAGE_SIZE);
    expect(page.total).toBe(100);
  });

  test('a whitespace-only search text is treated as empty', async () => {
    await fetchItems({ q: '   ', skip: 20 });

    expect(requested).toEqual([`/products?limit=${String(ITEMS_PAGE_SIZE)}&skip=20`]);
  });

  test('AC-4: a non-empty search text switches to /products/search with the trimmed q', async () => {
    const page = await fetchItems({ q: '  Product 1 ', skip: 0 });

    expect(requested).toEqual([
      `/products/search?q=Product+1&limit=${String(ITEMS_PAGE_SIZE)}&skip=0`,
    ]);
    expect(page.products.every((item) => item.title.includes('Product 1'))).toBe(true);
  });

  test('the page size can be overridden', async () => {
    const page = await fetchItems({ q: '', skip: 0, limit: 5 });

    expect(requested).toEqual(['/products?limit=5&skip=0']);
    expect(page.products).toHaveLength(5);
  });
});

describe('useItemsInfiniteQuery paging', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  function wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  test('AC-1: the next page starts after the last loaded item and stops at the total', async () => {
    // The catalog holds 100 items, so 20-item pages end exactly at skip 80.
    // Spreading reads every field during render, so the hook re-renders as pages arrive.
    const { result } = await renderHook(() => ({ ...useItemsInfiniteQuery('') }), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    for (const expectedSkip of [20, 40, 60, 80]) {
      expect(result.current.hasNextPage).toBe(true);
      await act(async () => {
        await result.current.fetchNextPage();
      });
      // Query-core commits pages on a timer; on slow CI runners that lands after the act.
      await waitFor(() => {
        expect(result.current.data?.pages.at(-1)?.skip).toBe(expectedSkip);
      });
    }

    expect(result.current.data?.pages).toHaveLength(5);
    expect(result.current.hasNextPage).toBe(false);
    expect(requested.filter((entry) => entry.includes('skip=80'))).toHaveLength(1);
  });
});
