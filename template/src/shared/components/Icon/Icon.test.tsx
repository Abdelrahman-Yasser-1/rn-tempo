import { screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { ICON_MIRRORED_IN_RTL } from '@assets/generated/icons.rtl';
import type { IconName } from '@assets/generated/icons.types';
import { logger } from '@services/logger/logger';
import { ICON_SIZES } from '@shared/constants/icon';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Icon } from './Icon';

// Decorative icons have no role; the size and mirroring checks read the svg's testID.
/* eslint-disable rn-tempo/discouraged-syntax -- decorative element: testID is the only handle */
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

  it('mirrors the directional icons of the whole set, and not vertical or symmetric ones', () => {
    expect(ICON_MIRRORED_IN_RTL).toEqual(
      expect.arrayContaining([
        'chevron-left',
        'chevron-right',
        'logout',
        'arrow-left',
        'arrow-right',
      ]),
    );
    expect(ICON_MIRRORED_IN_RTL).not.toContain('arrow-up');
    expect(ICON_MIRRORED_IN_RTL).not.toContain('arrow-down-left');
    expect(ICON_MIRRORED_IN_RTL).not.toContain('home');
  });

  it('renders nothing, and warns in development, for a name missing from a pruned registry', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
    const missing: IconName = 'not-an-icon' as IconName;
    await renderWithProviders(<Icon name={missing} testID="icon" />);
    expect(screen.queryByTestId('icon', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not-an-icon'));
  });
});
