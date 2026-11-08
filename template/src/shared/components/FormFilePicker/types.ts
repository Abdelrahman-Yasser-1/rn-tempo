import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { FilePickerProps } from '@shared/components/FilePicker';

export type FormFilePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<FilePickerProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
