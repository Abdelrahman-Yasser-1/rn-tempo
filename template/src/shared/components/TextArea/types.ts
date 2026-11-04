import type { TextFieldProps } from '../TextField';

export type TextAreaProps = Readonly<
  Omit<TextFieldProps, 'left' | 'right' | 'prefix' | 'suffix' | 'secureTextEntry' | 'multiline'> & {
    /** Hard character limit, shown as a counter ("12/250"). Defaults to 250. */
    maxLength?: number;
  }
>;
