import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListShimmer } from './ListShimmer';

// Shimmer containers have no role of their own; testID is the only handle on them.
/* eslint-disable no-restricted-syntax -- container without a role: testID is the only handle */
describe('ListShimmer', () => {
  it('announces the whole list as one busy loading placeholder', async () => {
    await renderWithProviders(<ListShimmer />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeBusy();
  });

  it('passes testID through to the skeleton', async () => {
    await renderWithProviders(<ListShimmer count={2} testID="list" />);
    expect(screen.getByTestId('list')).toBeOnTheScreen();
  });
});
