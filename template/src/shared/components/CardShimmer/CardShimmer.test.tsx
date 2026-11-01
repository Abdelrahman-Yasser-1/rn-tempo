import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { CardShimmer } from './CardShimmer';

describe('CardShimmer', () => {
  it('announces itself as a busy loading placeholder', async () => {
    await renderWithProviders(<CardShimmer />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeBusy();
  });
});
