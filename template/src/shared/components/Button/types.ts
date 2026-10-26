import type { PressableProps } from 'react-native';

import type { IconName } from '@assets/icons';

import type { TextProps } from '../Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> &
    Pick<TextProps, 'tx' | 'txOptions'> & {
      /** Label text. Use `tx` for a translated label instead. */
      title?: string;
      variant?: ButtonVariant;
      size?: ButtonSize;
      /** Shows a spinner, blocks presses and announces the busy state. */
      loading?: boolean;
      disabled?: boolean;
      leftIcon?: IconName;
      rightIcon?: IconName;
      /** Stretches to the container width. */
      fullWidth?: boolean;
    }
>;
