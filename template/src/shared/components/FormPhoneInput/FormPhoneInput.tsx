import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toKey } from '@services/i18n/keys';
import { PhoneInput } from '@shared/components/PhoneInput';

import type { FormPhoneInputProps } from './types';

/** `PhoneInput` bound to react-hook-form: the form value is the E.164 string. Validation keys come from the `validation` namespace (use `phoneSchema`). */
export function FormPhoneInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ref, ...rest }: FormPhoneInputProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(toKey(error.message)) : undefined;

  return (
    <PhoneInput
      {...rest}
      ref={ref}
      value={typeof field.value === 'string' ? field.value : ''}
      errorText={errorText}
      onChange={(e164) => {
        field.onChange(e164);
      }}
      onBlur={field.onBlur}
    />
  );
}
