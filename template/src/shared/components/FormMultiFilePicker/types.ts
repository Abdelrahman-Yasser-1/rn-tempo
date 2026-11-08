import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { MultiFilePickerProps } from '@shared/components/MultiFilePicker';

export type FormMultiFilePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<MultiFilePickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
