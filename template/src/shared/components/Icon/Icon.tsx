import { ICONS } from '@assets/generated/icons.registry';
import type { IconComponent, IconName } from '@assets/generated/icons.types';
import { logger } from '@services/logger/logger';

import type { IconProps } from './types';
import { useIcon } from './useIcon';

// Pruned release builds hold a subset of the registry, so a lookup can come back empty.
const REGISTRY: Partial<Record<IconName, IconComponent>> = ICONS;
const MIRRORED = { transform: [{ scaleX: -1 }] };

/**
 * Registry SVG icon tinted by a color token. Directional icons mirror in right-to-left layouts.
 * Decorative (hidden from screen readers) unless an `accessibilityLabel` is given. Release builds
 * are pruned (`yarn icons:prune`) to the icons the code names, so an icon missing from the registry
 * renders nothing; in development nothing is pruned, and the warning says what to do.
 */
export function Icon({ name, size, color, accessibilityLabel, testID }: IconProps) {
  const Svg = REGISTRY[name];
  const { pixels, tint, isMirrored } = useIcon({ name, size, color });
  if (!Svg) {
    if (__DEV__) {
      logger.warn(
        `Icon "${name}" is not in the registry. Run yarn assets, or add it to ICON_KEEP.`,
      );
    }
    return null;
  }
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
