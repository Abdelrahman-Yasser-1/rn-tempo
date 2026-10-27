import type { PressableProps } from 'react-native';

export type RadioProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'onPress' | 'disabled'> & {
    /** Value reported to the enclosing `RadioGroup` when selected. */
    value: string;
    label?: string;
    disabled?: boolean;
  }
>;
