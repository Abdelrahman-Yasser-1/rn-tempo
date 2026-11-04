import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { MultiSelectProps } from '../MultiSelect';

export type FormMultiSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<MultiSelectProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
