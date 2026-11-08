import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DetailsShimmer } from './DetailsShimmer';

// Shimmer containers have no role of their own; testID is the only handle on them.
/* eslint-disable rn-tempo/discouraged-syntax -- container without a role: testID is the only handle */
describe('DetailsShimmer', () => {
  it('announces itself as a busy loading placeholder and passes testID through', async () => {
    await renderWithProviders(<DetailsShimmer testID="details" />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeBusy();
    expect(screen.getByTestId('details')).toBeOnTheScreen();
  });
});
