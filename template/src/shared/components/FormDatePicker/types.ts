import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { DatePickerProps } from '@shared/components/DatePicker';

export type FormDatePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<DatePickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
