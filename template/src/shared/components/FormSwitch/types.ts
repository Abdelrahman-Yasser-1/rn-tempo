import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { SwitchProps } from '@shared/components/Switch';

export type FormSwitchProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<SwitchProps, 'value' | 'onValueChange'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'> & {
      /** Hint shown below the field; replaced by the validation error. */
      helperText?: string;
    }
>;
