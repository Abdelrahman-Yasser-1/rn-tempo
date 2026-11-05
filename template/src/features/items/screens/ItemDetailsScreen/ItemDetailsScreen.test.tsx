import { screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { useNetworkStore } from '@services/network/network';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ItemDetailsScreen } from './ItemDetailsScreen';

type ItemDetailsProps = ComponentProps<typeof ItemDetailsScreen>;

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

async function renderDetails(itemId: number) {
  const props = {
    route: { key: 'ItemDetails', name: 'ItemDetails', params: { itemId } },
  } as unknown as ItemDetailsProps;
  return renderWithProviders(<ItemDetailsScreen {...props} />);
}

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
});

describe('ItemDetailsScreen', () => {
  test('AC-7: shows a shimmer, then the title, image and formatted price', async () => {
    await renderDetails(1);

    // The shimmer has no text or role, so its testID is the only handle.
    // eslint-disable-next-line no-restricted-syntax -- decorative shimmer: testID is the only handle
    expect(screen.getByTestId('item-details.loading')).toBeOnTheScreen();

    expect(await screen.findByText('Product 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Product 1')).toBeOnTheScreen();
    expect(screen.getByText('$6.00')).toBeOnTheScreen();
    // eslint-disable-next-line no-restricted-syntax -- decorative shimmer: testID is the only handle
    expect(screen.queryByTestId('item-details.loading')).not.toBeOnTheScreen();
  });

  test('AC-7: shows the category, rating, stock and description of the item', async () => {
    await renderDetails(1);

    expect(await screen.findByText('Product 1')).toBeOnTheScreen();
    expect(screen.getByText('Category: beauty')).toBeOnTheScreen();
    expect(screen.getByText('Rating: 3.1 / 5')).toBeOnTheScreen();
    expect(screen.getByText('In stock: 11')).toBeOnTheScreen();
    expect(screen.getByText('Description of product 1')).toBeOnTheScreen();
  });

  test('a missing item shows the error state, and Retry asks again', async () => {
    let isMissing = true;
    server.use(
      http.get('*/products/:id', ({ params }) =>
        isMissing
          ? HttpResponse.json({ message: 'not found' }, { status: 404 })
          : HttpResponse.json({
              id: Number(params.id),
              title: 'Found it',
              description: 'Now it exists',
              price: 9,
              category: 'beauty',
              thumbnail: 'https://example.test/thumb.webp',
              rating: 4,
              stock: 1,
            }),
      ),
    );
    const { user } = await renderDetails(999);

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();

    isMissing = false;
    await user.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Found it')).toBeOnTheScreen();
  });

  // @tempo-feature:webview:start
  test('"Open product page" opens the web view with the product page and the item title', async () => {
    const { user } = await renderDetails(1);

    await user.press(await screen.findByRole('button', { name: 'Open product page' }));

    expect(mockRootNavigate).toHaveBeenCalledTimes(1);
    expect(mockRootNavigate).toHaveBeenCalledWith('WebView', {
      url: 'https://dummyjson.com/docs/products',
      title: 'Product 1',
    });
  });
  // @tempo-feature:webview:end
});
