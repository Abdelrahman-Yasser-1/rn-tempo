import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setFlagOverride } from '@services/flags/flagOverrides';
import { useNetworkStore } from '@services/network/network';
import { actAsync } from '@test-utils/act';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ITEMS_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../../constants';

import { ItemsListScreen } from './ItemsListScreen';

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

async function renderItemsList() {
  return renderWithProviders(<ItemsListScreen />);
}

/** Every request the list makes, as its path plus query string. */
const requested: string[] = [];

function recordRequests() {
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    requested.push(`${url.pathname}?${url.searchParams.toString()}`);
  });
}

/** Requests whose path is `/products` with the given `skip`. */
const pagesAt = (skip: number) =>
  requested.filter(
    (entry) => entry.startsWith('/products?') && entry.includes(`skip=${String(skip)}`),
  );

const searches = () => requested.filter((entry) => entry.startsWith('/products/search?'));

/** Lets query-core's batched notifications run inside act, so no update lands after the test. */
async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Fires the list's `onEndReached` through the first rendered row (RNTL bubbles to the list). */
async function reachEnd() {
  // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent returns an act promise
  await fireEvent(screen.getByLabelText('Product 1'), 'endReached');
}

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  requested.length = 0;
  recordRequests();
});

afterEach(() => {
  server.events.removeAllListeners();
  setFlagOverride('itemsCreateEnabled', undefined);
});

describe('ItemsListScreen', () => {
  test('shows the first page of items with their formatted prices', async () => {
    await renderItemsList();

    expect(await screen.findByText('Product 1')).toBeOnTheScreen();
    expect(screen.getByText('$6.00')).toBeOnTheScreen();
    expect(pagesAt(0)).toHaveLength(1);
    expect(requested).toContain(`/products?limit=${String(ITEMS_PAGE_SIZE)}&skip=0`);
  });

  test('shows the loading placeholder until the first page arrives', async () => {
    // Hold the first page until the placeholder is asserted; the mock server answers too fast to
    // catch it otherwise. Resolving falls through to the default products handler.
    const { promise: gate, resolve: release } = Promise.withResolvers<undefined>();
    server.use(
      http.get('*/products', async () => {
        await gate;
      }),
    );
    await renderItemsList();

    /* eslint-disable no-restricted-syntax -- the shimmer is decorative and has no role */
    expect(
      screen.getByTestId('items-list.loading', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    /* eslint-enable no-restricted-syntax */
    expect(screen.queryByText('Product 1')).not.toBeOnTheScreen();

    release(undefined);
    expect(await screen.findByText('Product 1')).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- the shimmer is decorative and has no role
    expect(screen.queryByTestId('items-list.loading')).not.toBeOnTheScreen();
  });

  test('pressing an item opens its details', async () => {
    const { user } = await renderItemsList();
    await screen.findByText('Product 1');

    await user.press(screen.getByLabelText('Product 1'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('ItemDetails', { itemId: 1 });
  });

  test('AC-1: reaching the end of the list loads the next page of 20', async () => {
    await renderItemsList();
    await screen.findByText('Product 1');

    await reachEnd();

    expect(await screen.findByText('Product 21')).toBeOnTheScreen();
    await settle();
    expect(pagesAt(20)).toHaveLength(1);
    expect(requested).toContain(`/products?limit=${String(ITEMS_PAGE_SIZE)}&skip=20`);
  });

  test('AC-2: pull to refresh reloads from the first page', async () => {
    await renderItemsList();
    await screen.findByText('Product 1');
    expect(pagesAt(0)).toHaveLength(1);

    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent returns an act promise
    await fireEvent(screen.getByLabelText('Product 1'), 'refresh');

    await waitFor(() => {
      expect(pagesAt(0)).toHaveLength(2);
    });
    await settle();
    expect(pagesAt(20)).toHaveLength(0);
  });

  test('AC-3: a search with no matches shows the empty state', async () => {
    const { user } = await renderItemsList();
    await screen.findByText('Product 1');

    await user.type(screen.getByLabelText('Search items'), 'zzz-no-match');

    expect(await screen.findByText('No items found', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText('Try a different search.')).toBeOnTheScreen();
  });

  test('AC-3: a failed request shows the error state, and Retry loads the list', async () => {
    let isFailing = true;
    server.use(
      http.get('*/products', () =>
        isFailing ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : undefined,
      ),
    );
    const { user } = await renderItemsList();

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();

    isFailing = false;
    await user.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Product 1')).toBeOnTheScreen();
    await settle();
  });

  test('AC-4: the search runs once, 300 ms after typing stops', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      await renderItemsList();
      const input = screen.getByLabelText('Search items');

      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent returns an act promise
      await fireEvent.changeText(input, 'P');
      await actAsync(() => {
        jest.advanceTimersByTime(100);
      });
      // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent returns an act promise
      await fireEvent.changeText(input, 'Product 1');

      await actAsync(() => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
      });
      expect(searches()).toHaveLength(0);

      await actAsync(() => {
        jest.advanceTimersByTime(1);
      });
      // The request leaves on the next tick; slow CI runners need the wait.
      await waitFor(() => {
        expect(searches()).toEqual(['/products/search?q=Product+1&limit=20&skip=0']);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('AC-6: the create button is shown while itemsCreateEnabled is on', async () => {
    const { user } = await renderItemsList();

    await user.press(screen.getByRole('button', { name: 'Create item' }));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('ItemCreate');
  });

  test('AC-6: the create button is hidden while itemsCreateEnabled is off', async () => {
    setFlagOverride('itemsCreateEnabled', false);

    await renderItemsList();
    await screen.findByText('Product 1');

    expect(screen.queryByRole('button', { name: 'Create item' })).not.toBeOnTheScreen();
  });
});
