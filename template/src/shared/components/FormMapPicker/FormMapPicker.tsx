import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { MapPicker } from '@shared/components/MapPicker';

import type { FormMapPickerProps } from './types';

/** `MapPicker` bound to react-hook-form; the value is `{ latitude, longitude, address? }`, or `null`. */
export function FormMapPicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormMapPickerProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <MapPicker
      {...rest}
      value={field.value ?? null}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
