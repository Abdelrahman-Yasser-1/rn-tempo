import { useUnistyles } from 'react-native-unistyles';

import { ICON_SIZES } from '@shared/constants/icon';
import { useRtl } from '@shared/hooks';

import type { IconName, IconProps } from './types';

/**
 * Icons that point somewhere. They are flipped horizontally in right-to-left layouts, so callers
 * never mirror them by hand. Add a new directional icon (`arrow-left`, ...) here when you add it.
 */
export const ICON_MIRRORED_IN_RTL = [
  'chevron-left',
  'chevron-right',
  'logout',
] as const satisfies readonly IconName[];

const MIRRORED_NAMES: readonly string[] = ICON_MIRRORED_IN_RTL;

type UseIconParams = Pick<IconProps, 'name' | 'size' | 'color'>;

/** The pixel size, tint and RTL mirroring of an icon. */
export function useIcon({ name, size = 'lg', color = 'textPrimary' }: UseIconParams) {
  const { theme } = useUnistyles();
  const isRtl = useRtl();

  return {
    pixels: typeof size === 'number' ? size : ICON_SIZES[size],
    tint: theme.colors[color],
    isMirrored: isRtl && MIRRORED_NAMES.includes(name),
  };
}
