import type { AccessibilityProps } from 'react-native';

import type { IconName } from '@assets/icons';
import type { ColorTokens } from '@theme/tokens';

export type { IconName };

export type IconProps = Readonly<
  Pick<AccessibilityProps, 'accessibilityLabel'> & {
    /** Name from the generated icon registry (`yarn assets:sync`). */
    name: IconName;
    /** Width and height in points; defaults to 24. */
    size?: number;
    /** Color token key; defaults to `textPrimary`. */
    color?: keyof ColorTokens;
    testID?: string;
  }
>;
