import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { PhoneInputProps } from '../PhoneInput';

export type FormPhoneInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<PhoneInputProps, 'value' | 'onChange' | 'errorText' | 'onBlur'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
