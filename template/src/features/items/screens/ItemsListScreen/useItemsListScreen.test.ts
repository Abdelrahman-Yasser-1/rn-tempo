import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setFlagOverride } from '@services/flags/flagOverrides';
import { useNetworkStore } from '@services/network/network';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { ITEMS_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../../constants';

import { useItemsListScreen } from './useItemsListScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
});

afterEach(() => {
  setFlagOverride('itemsCreateEnabled', undefined);
});

describe('useItemsListScreen', () => {
  test('starts pending, then exposes the first page of items', async () => {
    const { result } = await renderHookWithProviders(() => useItemsListScreen());

    expect(result.current.isPending).toBe(true);
    expect(result.current.items).toEqual([]);

    await waitFor(() => {
      expect(result.current.items).toHaveLength(ITEMS_PAGE_SIZE);
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });

  test('loading more appends the next page', async () => {
    const { result } = await renderHookWithProviders(() => useItemsListScreen());
    await waitFor(() => {
      expect(result.current.items).toHaveLength(ITEMS_PAGE_SIZE);
    });

    await act(() => {
      result.current.onLoadMore();
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(ITEMS_PAGE_SIZE * 2);
    });
  });

  test('a failed request flags the error and a refresh recovers', async () => {
    let isFailing = true;
    server.use(
      http.get('*/products', () =>
        isFailing ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : undefined,
      ),
    );
    const { result } = await renderHookWithProviders(() => useItemsListScreen());

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeTruthy();

    isFailing = false;
    await act(() => {
      result.current.onRefresh();
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(ITEMS_PAGE_SIZE);
    });
    expect(result.current.isError).toBe(false);
  });

  test('onSearchChange updates the search text and filters after the debounce', async () => {
    const { result } = await renderHookWithProviders(() => useItemsListScreen());
    await waitFor(() => {
      expect(result.current.items).toHaveLength(ITEMS_PAGE_SIZE);
    });

    await act(() => {
      result.current.onSearchChange('zzz-no-match');
      return Promise.resolve();
    });

    expect(result.current.search).toBe('zzz-no-match');
    await waitFor(
      () => {
        expect(result.current.items).toEqual([]);
      },
      { timeout: SEARCH_DEBOUNCE_MS * 10 },
    );
  });

  test('canCreate follows the itemsCreateEnabled flag', async () => {
    setFlagOverride('itemsCreateEnabled', false);
    const { result } = await renderHookWithProviders(() => useItemsListScreen());
    expect(result.current.canCreate).toBe(false);

    setFlagOverride('itemsCreateEnabled', true);
    await waitFor(() => {
      expect(result.current.canCreate).toBe(true);
    });
  });

  test('navigation handlers open the item, the create screen and go back', async () => {
    const { result } = await renderHookWithProviders(() => useItemsListScreen());

    result.current.onItemPress(7);
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('ItemDetails', { itemId: 7 });

    result.current.onCreate();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('ItemCreate');

    result.current.onBack();
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
