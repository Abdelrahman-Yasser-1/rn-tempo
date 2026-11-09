import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { OtpInput } from '@shared/components/OtpInput';

import type { FormOtpInputProps } from './types';

/** `OtpInput` bound to react-hook-form; validation keys come from the `validation` namespace (use `otpSchema`). */
export function FormOtpInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ...rest }: FormOtpInputProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <OtpInput
      {...rest}
      value={typeof field.value === 'string' ? field.value : ''}
      errorText={errorText}
      onChangeText={field.onChange}
    />
  );
}
