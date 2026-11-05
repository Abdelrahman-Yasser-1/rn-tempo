import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useItemDetailsScreen } from './useItemDetailsScreen';

type DetailsRoute = Parameters<typeof useItemDetailsScreen>[0];

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

// @tempo-feature:webview:start
const mockRootNavigate = jest.fn<undefined, [string, object]>();
jest.mock('@navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (name: string, params: object) => {
      mockRootNavigate(name, params);
    },
  },
}));
// @tempo-feature:webview:end

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

const routeFor = (itemId: number) =>
  ({ key: 'ItemDetails', name: 'ItemDetails', params: { itemId } }) as unknown as DetailsRoute;

describe('useItemDetailsScreen', () => {
  test('loads the item from the route param', async () => {
    const { result } = await renderHookWithProviders(() => useItemDetailsScreen(routeFor(3)));

    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(false);

    await waitFor(() => {
      expect(result.current.data?.id).toBe(3);
    });
    expect(result.current.language).toBe('en');
  });

  test('a failed request flags the error and retry loads the item', async () => {
    let isFailing = true;
    server.use(
      http.get('*/products/:id', () =>
        isFailing ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : undefined,
      ),
    );
    const { result } = await renderHookWithProviders(() => useItemDetailsScreen(routeFor(2)));

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.data).toBeUndefined();

    isFailing = false;
    await act(() => {
      result.current.onRetry();
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.data?.id).toBe(2);
    });
    expect(result.current.isError).toBe(false);
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useItemDetailsScreen(routeFor(1)));

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  // @tempo-feature:webview:start
  test('opens the product page of the item in the web view', async () => {
    const { result } = await renderHookWithProviders(() => useItemDetailsScreen(routeFor(4)));
    await waitFor(() => {
      expect(result.current.data?.id).toBe(4);
    });

    result.current.onOpenProductPage();

    expect(mockRootNavigate).toHaveBeenCalledWith('WebView', {
      url: 'https://dummyjson.com/docs/products',
      title: 'Product 4',
    });
  });
  // @tempo-feature:webview:end
});
