import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { NumberInput } from '../NumberInput';

import type { FormNumberInputProps } from './types';

/** `NumberInput` bound to react-hook-form; validation keys come from the `validation` namespace. */
export function FormNumberInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, min, ...rest }: FormNumberInputProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <NumberInput
      {...rest}
      value={typeof field.value === 'number' ? field.value : (min ?? 0)}
      errorText={errorText}
      onChange={field.onChange}
      min={min}
    />
  );
}
