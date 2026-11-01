import { screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { View as RNView } from 'react-native';

// Decorative views have no accessible role, so testID is the only handle on them.
/* eslint-disable no-restricted-syntax -- decorative element: testID is the only handle */
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Bone } from './Bone';

jest.mock('react-native-fast-shimmer', () => {
  const { View } = jest.requireActual<{ View: typeof RNView }>('react-native');
  return {
    Shimmer: () => <View testID="bone.shimmer" />,
  };
});

describe('Bone', () => {
  it('is hidden from screen readers', async () => {
    await renderWithProviders(<Bone testID="bone" />);
    const bone = screen.getByTestId('bone', { includeHiddenElements: true });
    expect(bone).toHaveProp('accessibilityElementsHidden', true);
    expect(bone).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  });

  it('applies the requested size', async () => {
    await renderWithProviders(<Bone testID="bone" width={120} height={20} />);
    expect(screen.getByTestId('bone', { includeHiddenElements: true })).toHaveStyle({
      width: 120,
      height: 20,
    });
  });

  it('animates with a shimmer when reduced motion is off', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await renderWithProviders(<Bone testID="bone" />);
    expect(
      await screen.findByTestId('bone.shimmer', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('stays static when the user prefers reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderWithProviders(<Bone testID="bone" />);
    await screen.findByTestId('bone', { includeHiddenElements: true });
    expect(
      screen.queryByTestId('bone.shimmer', { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });
});
