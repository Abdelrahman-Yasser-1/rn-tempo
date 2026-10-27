import type { ReactNode, Ref } from 'react';
import type { TextInputInstance, TextInputProps } from 'react-native';

export type TextFieldProps = Readonly<
  Omit<TextInputProps, 'style' | 'editable'> & {
    /** React 19: the ref is a regular prop. */
    ref?: Ref<TextInputInstance>;
    label?: string;
    /** Hint shown below the field; replaced by `errorText` when there is an error. */
    helperText?: string;
    /** Error message; also marks the field invalid and is announced politely. */
    errorText?: string;
    disabled?: boolean;
    /** Adornment rendered at the start edge (left in LTR, right in RTL). */
    left?: ReactNode;
    /** Adornment rendered at the end edge; replaced by the eye toggle for `secureTextEntry`. */
    right?: ReactNode;
  }
>;
