// Decorative views have no accessible role, so testID is the only handle on them.
/* eslint-disable no-restricted-syntax -- decorative element: testID is the only handle */
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { spacing } from '@theme/tokens';

import { Spacer } from './Spacer';

describe('Spacer', () => {
  it('is vertical space of the md token by default', async () => {
    await renderWithProviders(<Spacer testID="spacer" />);
    expect(screen.getByTestId('spacer', { includeHiddenElements: true })).toHaveStyle({ height: spacing.md });
  });

  it('takes its size from the given spacing token', async () => {
    await renderWithProviders(<Spacer testID="spacer" size="lg" />);
    expect(screen.getByTestId('spacer', { includeHiddenElements: true })).toHaveStyle({ height: spacing.lg });
  });

  it('uses width instead of height when horizontal', async () => {
    await renderWithProviders(<Spacer testID="spacer" size="sm" horizontal />);
    expect(screen.getByTestId('spacer', { includeHiddenElements: true })).toHaveStyle({ width: spacing.sm });
  });

  it('is hidden from screen readers', async () => {
    await renderWithProviders(<Spacer testID="spacer" />);
    expect(screen.getByTestId('spacer', { includeHiddenElements: true })).toHaveProp('accessibilityElementsHidden', true);
  });
});
