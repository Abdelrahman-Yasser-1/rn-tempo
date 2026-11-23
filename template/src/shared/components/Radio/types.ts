import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';

export type RadioProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'onPress' | 'disabled'> & {
    /** Value reported to the enclosing `RadioGroup` when selected. */
    value: string;
    label?: string;
    /** Decoration between the circle and the label, such as a colour swatch. */
    leading?: ReactNode;
    disabled?: boolean;
  }
>;
