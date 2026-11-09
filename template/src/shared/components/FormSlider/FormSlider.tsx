import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toKey } from '@services/i18n/keys';
import { Slider } from '@shared/components/Slider';

import type { FormSliderProps } from './types';

/** `Slider` bound to react-hook-form; validation keys come from the `validation` namespace. */
export function FormSlider<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, min, ...rest }: FormSliderProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(toKey(error.message)) : undefined;

  return (
    <Slider
      {...rest}
      value={typeof field.value === 'number' ? field.value : min}
      errorText={errorText}
      onChange={field.onChange}
      min={min}
    />
  );
}
