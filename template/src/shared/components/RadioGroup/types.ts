import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

export type RadioGroupProps = Readonly<
  Omit<ViewProps, 'children'> & {
    value: string | undefined;
    onChange: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }
>;

export type RadioGroupContextValue = {
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
};
