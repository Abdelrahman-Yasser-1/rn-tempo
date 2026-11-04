import type { ReactNode, Ref } from 'react';
import type { TextInputInstance, TextInputProps } from 'react-native';

export type TextFieldProps = Readonly<
  Omit<TextInputProps, 'style' | 'editable' | 'readOnly'> & {
    /** React 19: the ref is a regular prop. */
    ref?: Ref<TextInputInstance>;
    label?: string;
    /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
    required?: boolean;
    /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
    subLabel?: string;
    /** Help text revealed inline by an info button next to the label. Needs `label`. */
    tooltip?: string;
    /** Hint shown below the field; replaced by `errorText` when there is an error. */
    helperText?: string;
    /** Error message; also marks the field invalid and is announced politely. */
    errorText?: string;
    disabled?: boolean;
    /** Shows the value in a distinct, non-editable style; the text can still be selected. */
    readOnly?: boolean;
    /** Adornment rendered at the start edge (left in LTR, right in RTL). */
    left?: ReactNode;
    /** Adornment rendered at the end edge; replaced by the eye toggle for `secureTextEntry`. */
    right?: ReactNode;
    /** Text or node inside the field, right before the input (e.g. a country code). */
    prefix?: ReactNode;
    /** Text or node inside the field, right after the input (e.g. a unit or currency). */
    suffix?: ReactNode;
  }
>;
