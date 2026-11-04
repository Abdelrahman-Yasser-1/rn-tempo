import type { AccessibilityProps } from 'react-native';

import type { IconName } from '@assets/generated/icons.types';
import type { IconSize } from '@shared/constants/icon';
import type { ColorTokens } from '@theme/tokens';

export type { IconName, IconSize };

export type IconProps = Readonly<
  Pick<AccessibilityProps, 'accessibilityLabel'> & {
    /** Name from the generated icon registry (`yarn assets`). */
    name: IconName;
    /** A size token (`xs` 12 ... `xl` 32) or points; defaults to `lg` (24). */
    size?: IconSize | number;
    /** Color token key; defaults to `textPrimary`. */
    color?: keyof ColorTokens;
    /** Raw colour that overrides `color`, for pairs computed outside the token set. */
    tint?: string;
    testID?: string;
  }
>;
