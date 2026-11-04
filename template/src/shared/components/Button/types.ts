import type { PressableProps } from 'react-native';

import type { IconName } from '@assets/generated/icons.types';
import type { ButtonVariant } from '@theme/buttonVariants';

import type { TextProps } from '../Text';

export type { ButtonVariant };
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonIconPosition = 'start' | 'end';

export type ButtonProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> &
    Pick<TextProps, 'tx' | 'txOptions'> & {
      /** Label text. Use `tx` for a translated label instead. */
      title?: string;
      variant?: ButtonVariant;
      size?: ButtonSize;
      /** Shows a spinner (in place of the icon), blocks presses and announces the busy state. */
      loading?: boolean;
      disabled?: boolean;
      /** Icon next to the label; icon-only buttons are `IconButton`. */
      icon?: IconName;
      /** Which side of the label the icon sits on, in the reading direction. Defaults to `start`. */
      iconPosition?: ButtonIconPosition;
      /** Stretches to the container width. */
      fullWidth?: boolean;
    }
>;
