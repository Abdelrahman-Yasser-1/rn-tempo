import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { OtpInputProps } from '../OtpInput';

export type FormOtpInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<OtpInputProps, 'value' | 'onChangeText' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
