import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { MultiFilePicker } from '@shared/components/MultiFilePicker';

import type { FormMultiFilePickerProps } from './types';

/** `MultiFilePicker` bound to react-hook-form; the value is an array of `PickedFile`. */
export function FormMultiFilePicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormMultiFilePickerProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <MultiFilePicker
      {...rest}
      value={Array.isArray(field.value) ? field.value : []}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
