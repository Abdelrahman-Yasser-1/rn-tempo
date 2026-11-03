import { useUnistyles } from 'react-native-unistyles';

import { ICON_MIRRORED_IN_RTL } from '@assets/generated/icons.rtl';
import { ICON_SIZES } from '@shared/constants/icon';
import { useRtl } from '@shared/hooks';

import type { IconProps } from './types';

const MIRRORED_NAMES: ReadonlySet<string> = new Set(ICON_MIRRORED_IN_RTL);

type UseIconParams = Pick<IconProps, 'name' | 'size' | 'color'>;

/** The pixel size, tint and RTL mirroring of an icon. */
export function useIcon({ name, size = 'lg', color = 'textPrimary' }: UseIconParams) {
  const { theme } = useUnistyles();
  const isRtl = useRtl();

  return {
    pixels: typeof size === 'number' ? size : ICON_SIZES[size],
    tint: theme.colors[color],
    isMirrored: isRtl && MIRRORED_NAMES.has(name),
  };
}
