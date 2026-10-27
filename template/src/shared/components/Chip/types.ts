import type { PressableProps } from 'react-native';

import type { IconName } from '@assets/icons';

export type ChipProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'disabled'> & {
    label: string;
    /** Filled when selected (filter chips). */
    selected?: boolean;
    disabled?: boolean;
    leftIcon?: IconName;
  }
>;
