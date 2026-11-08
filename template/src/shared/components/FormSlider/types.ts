import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { SliderProps } from '@shared/components/Slider';

export type FormSliderProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<SliderProps, 'value' | 'onChange' | 'errorText'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
