import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListLoadingMore } from './ListLoadingMore';

describe('ListLoadingMore', () => {
  it('is a busy progress bar named "Loading more"', async () => {
    await renderWithProviders(<ListLoadingMore />);

    expect(screen.getByRole('progressbar', { name: 'Loading more' })).toBeBusy();
  });

  it('translates its name', async () => {
    await renderWithProviders(<ListLoadingMore />, { language: 'ar' });

    expect(screen.getByRole('progressbar', { name: 'جارٍ تحميل المزيد' })).toBeOnTheScreen();
  });

  it('accepts a custom accessibility name', async () => {
    await renderWithProviders(<ListLoadingMore label="Fetching more orders" />);

    expect(screen.getByRole('progressbar', { name: 'Fetching more orders' })).toBeOnTheScreen();
  });
});
