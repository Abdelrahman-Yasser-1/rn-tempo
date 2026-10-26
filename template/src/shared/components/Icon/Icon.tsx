import { useUnistyles } from 'react-native-unistyles';

import { icons } from '@assets/icons';

import type { IconProps } from './types';

const DEFAULT_SIZE = 24;

/**
 * Registry SVG icon tinted by a color token. Decorative (hidden from screen readers) unless an
 * `accessibilityLabel` is given.
 */
export function Icon({
  name,
  size = DEFAULT_SIZE,
  color = 'textPrimary',
  accessibilityLabel,
  testID,
}: IconProps) {
  const { theme } = useUnistyles();
  const Svg = icons[name];
  const isLabelled = accessibilityLabel !== undefined;

  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      color={theme.colors[color]}
      accessible={isLabelled}
      accessibilityRole={isLabelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!isLabelled}
      importantForAccessibility={isLabelled ? 'yes' : 'no-hide-descendants'}
    />
  );
}
