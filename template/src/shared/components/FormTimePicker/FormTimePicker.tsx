import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toKey } from '@services/i18n/keys';
import { TimePicker } from '@shared/components/TimePicker';

import type { FormTimePickerProps } from './types';

/** `TimePicker` bound to react-hook-form; the value is a `HH:mm` string. */
export function FormTimePicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormTimePickerProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(toKey(error.message)) : undefined;

  return (
    <TimePicker
      {...rest}
      value={typeof field.value === 'string' && field.value !== '' ? field.value : undefined}
      errorText={errorText}
      onChange={field.onChange}
    />
  );
}
