import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PaginatedList } from './PaginatedList';
import type { PaginatedQuery } from './types';

type Page = Readonly<{ rows: readonly string[] }>;

function makeQuery(overrides: Partial<PaginatedQuery<Page>> = {}): PaginatedQuery<Page> {
  const data: InfiniteData<Page> = {
    pages: [{ rows: ['Alpha', 'Beta'] }, { rows: ['Gamma'] }],
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

/** Lets FlashList's deferred load callback run inside act, so no update lands after the test. */
async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function renderList(query: PaginatedQuery<Page>) {
  const view = await renderWithProviders(
    <PaginatedList
      query={query}
      getItems={(page) => page.rows}
      renderItem={({ item }) => <Text>{item}</Text>}
      keyExtractor={(item) => item}
      testID="list"
    />,
  );
  await settle();
  return view;
}

describe('PaginatedList', () => {
  it('renders the items of every page', async () => {
    await renderList(makeQuery());
    expect(screen.getByText('Alpha')).toBeOnTheScreen();
    expect(screen.getByText('Gamma')).toBeOnTheScreen();
  });

  it('shows the default empty state without items', async () => {
    await renderList(makeQuery({ data: { pages: [{ rows: [] }], pageParams: [0] } }));
    expect(screen.getByText('Nothing to show')).toBeOnTheScreen();
  });

  it('shows the error state and retries through refetch', async () => {
    const refetch = jest.fn();
    const { user } = await renderList(
      makeQuery({ isError: true, error: new Error('boom'), refetch }),
    );
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loading placeholder while the first page is pending', async () => {
    await renderList(makeQuery({ isPending: true, data: undefined }));
    expect(screen.queryByText('Alpha')).not.toBeOnTheScreen();
  });

  it('shows the shimmer, and neither items nor an error, while the first page loads', async () => {
    await renderList(makeQuery({ isPending: true, data: undefined }));
    /* eslint-disable rn-tempo/discouraged-syntax -- the shimmer is decorative and has no role */
    expect(screen.getByTestId('list.loading', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('list.list')).not.toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeOnTheScreen();
  });

  it('shows the loadingComponent instead of the shimmer when given', async () => {
    await renderWithProviders(
      <PaginatedList
        query={makeQuery({ isPending: true, data: undefined })}
        getItems={(page: Page) => page.rows}
        renderItem={({ item }) => <Text>{item}</Text>}
        keyExtractor={(item) => item}
        loadingComponent={<Text>Custom loading</Text>}
        testID="list"
      />,
    );
    expect(screen.getByText('Custom loading')).toBeOnTheScreen();
  });

  it('shows the error state instead of the list and keeps loaded pages out of it', async () => {
    await renderList(makeQuery({ isError: true, error: new Error('boom') }));
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.queryByText('Alpha')).not.toBeOnTheScreen();
  });

  it('shows a custom empty component instead of the default', async () => {
    await renderWithProviders(
      <PaginatedList
        query={makeQuery({ data: { pages: [{ rows: [] }], pageParams: [0] } })}
        getItems={(page: Page) => page.rows}
        renderItem={({ item }) => <Text>{item}</Text>}
        keyExtractor={(item) => item}
        ListEmptyComponent={<Text>No orders yet</Text>}
      />,
    );
    await settle();
    expect(screen.getByText('No orders yet')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing to show')).not.toBeOnTheScreen();
  });

  it('loads the next page when the end is reached and there is one', async () => {
    const fetchNextPage = jest.fn();
    await renderList(makeQuery({ fetchNextPage, hasNextPage: true }));
    await fireEvent(screen.getByText('Alpha'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not load more at the end of the last page', async () => {
    const fetchNextPage = jest.fn();
    await renderList(makeQuery({ fetchNextPage, hasNextPage: false }));
    await fireEvent(screen.getByText('Alpha'), 'endReached');
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not load more while a next page is already loading', async () => {
    const fetchNextPage = jest.fn();
    await renderList(makeQuery({ fetchNextPage, hasNextPage: true, isFetchingNextPage: true }));
    await fireEvent(screen.getByText('Alpha'), 'endReached');
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('refetches on pull to refresh', async () => {
    const refetch = jest.fn();
    await renderList(makeQuery({ refetch }));
    await fireEvent(screen.getByText('Alpha'), 'refresh');
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the footer loader only while the next page is loading', async () => {
    const { rerender } = await renderList(makeQuery());
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the loader is decorative and has no role
    expect(screen.queryByTestId('list.loading-more')).not.toBeOnTheScreen();

    await rerender(
      <PaginatedList
        query={makeQuery({ isFetchingNextPage: true })}
        getItems={(page: Page) => page.rows}
        renderItem={({ item }) => <Text>{item}</Text>}
        keyExtractor={(item) => item}
        testID="list"
      />,
    );
    await settle();
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- the loader is decorative and has no role
    expect(screen.getByTestId('list.loading-more')).toBeOnTheScreen();
  });
});
