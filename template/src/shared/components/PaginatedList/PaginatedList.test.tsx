import type { InfiniteData } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
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
});
