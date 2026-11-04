import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { MonthYearPicker } from '../MonthYearPicker';

import type { FormMonthYearPickerProps } from './types';

/** `MonthYearPicker` bound to react-hook-form; the value is a `YYYY-MM` string. */
export function FormMonthYearPicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormMonthYearPickerProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <MonthYearPicker
      {...rest}
      value={typeof field.value === 'string' && field.value !== '' ? field.value : undefined}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
