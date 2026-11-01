// Decorative views have no accessible role, so testID is the only handle on them.
/* eslint-disable no-restricted-syntax -- decorative element: testID is the only handle */
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { spacing } from '@theme/tokens';

import { Divider } from './Divider';

describe('Divider', () => {
  it('is a horizontal hairline by default', async () => {
    await renderWithProviders(<Divider testID="divider" />);
    expect(screen.getByTestId('divider', { includeHiddenElements: true })).toHaveStyle({
      alignSelf: 'stretch',
    });
    expect(screen.getByTestId('divider', { includeHiddenElements: true })).toHaveStyle({
      marginVertical: spacing.none,
    });
  });

  it('switches to a vertical hairline with horizontal margin', async () => {
    await renderWithProviders(<Divider testID="divider" orientation="vertical" spacing="sm" />);
    expect(screen.getByTestId('divider', { includeHiddenElements: true })).toHaveStyle({
      marginHorizontal: spacing.sm,
      alignSelf: 'stretch',
    });
  });

  it('is hidden from screen readers', async () => {
    await renderWithProviders(<Divider testID="divider" />);
    expect(screen.getByTestId('divider', { includeHiddenElements: true })).toHaveProp(
      'accessibilityElementsHidden',
      true,
    );
  });
});
