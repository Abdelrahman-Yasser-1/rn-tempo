import { screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { ICONS } from '@assets/generated/icons.registry';
import { ICON_SIZES } from '@shared/constants/icon';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Icon } from './Icon';
import { ICON_MIRRORED_IN_RTL } from './useIcon';

// Decorative icons have no role; the size and mirroring checks read the svg's testID.
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

  it('sizes the svg from a token or points, defaulting to lg', async () => {
    await renderWithProviders(
      <>
        <Icon name="search" testID="default" />
        <Icon name="search" testID="token" size="xl" />
        <Icon name="search" testID="points" size={40} />
      </>,
    );
    const read = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
    expect(read('default')).toHaveProp('width', ICON_SIZES.lg);
    expect(read('token')).toHaveProp('height', ICON_SIZES.xl);
    expect(read('points')).toHaveProp('height', 40);
  });

  it('does not mirror in left-to-right layouts', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    await renderWithProviders(<Icon name="chevron-right" testID="icon" />);
    expect(screen.getByTestId('icon', { includeHiddenElements: true })).not.toHaveStyle({
      transform: [{ scaleX: -1 }],
    });
  });

  it('mirrors directional icons, and only those, in right-to-left layouts', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    await renderWithProviders(
      <>
        <Icon name="chevron-left" testID="directional" />
        <Icon name="check" testID="symmetric" />
      </>,
    );
    const read = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
    expect(read('directional')).toHaveStyle({ transform: [{ scaleX: -1 }] });
    expect(read('symmetric')).not.toHaveStyle({ transform: [{ scaleX: -1 }] });
  });

  it('lists every directional icon of the registry as mirrored', () => {
    const directional = Object.keys(ICONS).filter((name) =>
      /^(?:arrow|chevron|corner|arrows)-.*(?:left|right|back|forward)|^log(?:in|out)/.test(name),
    );
    expect(ICON_MIRRORED_IN_RTL).toEqual(expect.arrayContaining(directional));
  });
});
