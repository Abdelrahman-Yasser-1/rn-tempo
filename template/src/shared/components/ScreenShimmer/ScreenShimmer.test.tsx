// Shimmer containers have no role of their own; testID is the only handle on them.
/* eslint-disable rn-tempo/discouraged-syntax -- container without a role: testID is the only handle */

import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ScreenShimmer } from './ScreenShimmer';

describe('ScreenShimmer', () => {
  it('announces the whole screen as a busy loading placeholder', async () => {
    await renderWithProviders(<ScreenShimmer />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeBusy();
  });

  it('passes testID through to the screen container', async () => {
    await renderWithProviders(<ScreenShimmer testID="screen-shimmer" cardCount={1} />);
    expect(screen.getByTestId('screen-shimmer')).toBeOnTheScreen();
  });
});
