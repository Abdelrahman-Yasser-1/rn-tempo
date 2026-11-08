import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';

import type { TextAreaProps } from '@shared/components/TextArea';

export type FormTextAreaProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = Readonly<
  Omit<TextAreaProps, 'value' | 'defaultValue' | 'errorText' | 'onChangeText' | 'onBlur'> &
    Pick<UseControllerProps<TFieldValues, TName>, 'name' | 'control'>
>;
