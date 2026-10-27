import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export type CardProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> & {
    variant?: CardVariant;
    /** Inner padding token; defaults to `lg`. */
    padding?: CardPadding;
    /** Pass `onPress` to make the whole card a button. */
    children?: ReactNode;
  }
>;
