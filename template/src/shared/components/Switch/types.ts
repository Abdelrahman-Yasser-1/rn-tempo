import type { PressableProps } from 'react-native';

export type SwitchProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'onPress' | 'disabled'> & {
    value: boolean;
    onValueChange: (value: boolean) => void;
    label?: string;
    disabled?: boolean;
  }
>;
