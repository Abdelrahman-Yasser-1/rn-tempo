import type { PressableProps } from 'react-native';

import type { IconName } from '@assets/icons';

import type { ButtonSize, ButtonVariant } from '../Button';

export type IconButtonProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'accessibilityLabel'> & {
    icon: IconName;
    /** Required: an icon alone has no accessible name. */
    accessibilityLabel: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
  }
>;
