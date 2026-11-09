import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toKey } from '@services/i18n/keys';
import { Select } from '@shared/components/Select';

import type { FormSelectProps } from './types';

/** `Select` bound to react-hook-form; validation keys come from the `validation` namespace. */
export function FormSelect<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormSelectProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(toKey(error.message)) : undefined;

  return (
    <Select
      {...rest}
      value={typeof field.value === 'string' ? field.value : undefined}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
