import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { TextFieldProps } from '../TextField';

export type FormTextFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<TextFieldProps, 'value' | 'errorText' | 'onChangeText' | 'onBlur'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
