import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Icon } from './Icon';

// Decorative icons have no role; the default-size check reads the svg's testID.
/* eslint-disable no-restricted-syntax -- decorative element: testID is the only handle */
describe('Icon', () => {
  it('is decorative and hidden from screen readers without a label', async () => {
    await renderWithProviders(<Icon name="check" testID="icon" />);
    const icon = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(icon).toHaveProp('accessibilityElementsHidden', true);
    expect(icon).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(screen.queryByRole('image')).not.toBeOnTheScreen();
  });

  it('is exposed as a labelled image when given an accessibilityLabel', async () => {
    await renderWithProviders(<Icon name="close" accessibilityLabel="Dismiss" />);
    expect(screen.getByRole('image', { name: 'Dismiss' })).toBeOnTheScreen();
  });

  it('sizes the svg to the requested size, defaulting to 24', async () => {
    await renderWithProviders(
      <>
        <Icon name="search" testID="default" />
        <Icon name="search" testID="large" size={40} />
      </>,
    );
    expect(screen.getByTestId('default', { includeHiddenElements: true })).toHaveProp('width', 24);
    expect(screen.getByTestId('large', { includeHiddenElements: true })).toHaveProp('height', 40);
  });
});
