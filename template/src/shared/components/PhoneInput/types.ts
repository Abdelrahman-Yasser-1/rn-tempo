import type { Ref } from 'react';
import type { TextInputInstance, TextInputProps } from 'react-native';

import type { Country } from '@shared/constants/countries';

export type PhoneInputDetails = Readonly<{
  /** The selected country. */
  country: Country;
  /** Digits after the dial code, without the national trunk zero. */
  nationalNumber: string;
}>;

export type PhoneInputProps = Readonly<{
  /** Full number in E.164 (`+9665…`), or an empty string when nothing is entered. */
  value: string;
  onChange: (e164: string, details: PhoneInputDetails) => void;
  /** Country used until a number or a pick says otherwise; defaults to `'SA'`. */
  defaultCountry?: string;
  /** React 19: the ref is a regular prop. */
  ref?: Ref<TextInputInstance>;
  label?: string;
  /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
  required?: boolean;
  /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
  subLabel?: string;
  /** Help text revealed inline by an info button next to the label. Needs `label`. */
  tooltip?: string;
  placeholder?: string;
  helperText?: string;
  /** Error message; also marks the field invalid and is announced politely. */
  errorText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onBlur?: TextInputProps['onBlur'];
  /** Applied to the number field; the country button adds `.country` (and its own parts). */
  testID?: string;
}>;
