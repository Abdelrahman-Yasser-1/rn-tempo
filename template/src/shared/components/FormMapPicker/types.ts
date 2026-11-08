import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { MapPickerProps } from '@shared/components/MapPicker';

export type FormMapPickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<MapPickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
