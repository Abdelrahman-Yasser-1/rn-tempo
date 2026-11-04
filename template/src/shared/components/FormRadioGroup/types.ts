import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { RadioGroupProps } from '../RadioGroup';

export type FormRadioGroupProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<RadioGroupProps, 'value' | 'onChange'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'> & {
      label?: string;
      /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
      required?: boolean;
      /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
      subLabel?: string;
      /** Help text revealed inline by an info button next to the label. Needs `label`. */
      tooltip?: string;
      /** Hint shown below the field; replaced by the validation error. */
      helperText?: string;
    }
>;
