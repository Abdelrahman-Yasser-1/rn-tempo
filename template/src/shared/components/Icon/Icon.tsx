import { ICONS } from '@assets/generated/icons.registry';

import type { IconProps } from './types';
import { useIcon } from './useIcon';

const MIRRORED = { transform: [{ scaleX: -1 }] };

/**
 * Registry SVG icon tinted by a color token. Directional icons mirror in right-to-left layouts.
 * Decorative (hidden from screen readers) unless an `accessibilityLabel` is given.
 */
export function Icon({ name, size, color, accessibilityLabel, testID }: IconProps) {
  const Svg = ICONS[name];
  const { pixels, tint, isMirrored } = useIcon({ name, size, color });
  const isLabelled = accessibilityLabel !== undefined;

  return (
    <Svg
      testID={testID}
      width={pixels}
      height={pixels}
      color={tint}
      style={isMirrored ? MIRRORED : undefined}
      accessible={isLabelled}
      accessibilityRole={isLabelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!isLabelled}
      importantForAccessibility={isLabelled ? 'yes' : 'no-hide-descendants'}
    />
  );
}
