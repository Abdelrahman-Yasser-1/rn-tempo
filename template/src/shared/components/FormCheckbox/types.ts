import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { CheckboxProps } from '@shared/components/Checkbox';

export type FormCheckboxProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<CheckboxProps, 'checked' | 'onChange'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'> & {
      /** Hint shown below the field; replaced by the validation error. */
      helperText?: string;
    }
>;
