import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { TimePickerProps } from '@shared/components/TimePicker';

export type FormTimePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<TimePickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
