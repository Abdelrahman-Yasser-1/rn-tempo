import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FilePicker } from '../FilePicker';

import type { FormFilePickerProps } from './types';

/** `FilePicker` bound to react-hook-form; the value is a `PickedFile`, or `null` when empty. */
export function FormFilePicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormFilePickerProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <FilePicker
      {...rest}
      value={field.value ?? null}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
