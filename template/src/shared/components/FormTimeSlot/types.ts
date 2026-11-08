import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { TimeSlotPickerProps } from '@shared/components/TimeSlotPicker';

export type FormTimeSlotProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<TimeSlotPickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
