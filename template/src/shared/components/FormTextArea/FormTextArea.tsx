import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { TextArea } from '../TextArea';

import type { FormTextAreaProps } from './types';

/** `TextArea` bound to react-hook-form; validation keys come from the `validation` namespace. */
export function FormTextArea<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, ref, ...rest }: FormTextAreaProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;

  return (
    <TextArea
      {...rest}
      ref={ref}
      value={typeof field.value === 'string' ? field.value : ''}
      errorText={errorText}
      onChangeText={field.onChange}
      onBlur={field.onBlur}
    />
  );
}
