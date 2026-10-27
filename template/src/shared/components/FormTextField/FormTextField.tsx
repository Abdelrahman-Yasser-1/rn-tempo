import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { TextField } from '../TextField';

import type { FormTextFieldProps } from './types';

/**
 * `TextField` bound to react-hook-form. Validation messages are i18n keys from the `validation`
 * namespace (set by the Zod schemas) and are translated here.
 */
export function FormTextField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ref, ...rest }: FormTextFieldProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <TextField
      {...rest}
      ref={ref}
      value={typeof field.value === 'string' ? field.value : ''}
      errorText={errorText}
      onChangeText={field.onChange}
      onBlur={field.onBlur}
    />
  );
}
