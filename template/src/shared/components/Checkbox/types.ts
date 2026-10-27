import type { PressableProps } from 'react-native';

export type CheckboxProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'onPress' | 'disabled'> & {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
  }
>;
