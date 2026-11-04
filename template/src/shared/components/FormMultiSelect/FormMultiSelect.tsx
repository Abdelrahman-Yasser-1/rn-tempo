import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { MultiSelect } from '../MultiSelect';

import type { FormMultiSelectProps } from './types';

const NONE: readonly string[] = [];

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** `MultiSelect` bound to react-hook-form; validation keys come from the `validation` namespace. */
export function FormMultiSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormMultiSelectProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <MultiSelect
      {...rest}
      value={isStringArray(field.value) ? field.value : NONE}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
