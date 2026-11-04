import type { Country } from '@shared/constants/countries';

export type CountryPickerProps = Readonly<{
  /** ISO 3166-1 alpha-2 code of the selected country; falls back to `defaultCountry`. */
  value?: string;
  onChange: (country: Country) => void;
  /** Country shown while `value` is unset or unknown; defaults to `'SA'`. */
  defaultCountry?: string;
  /** Flag and dial code only, without a border: for use inside another field (e.g. `PhoneInput`). */
  compact?: boolean;
  label?: string;
  /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
  required?: boolean;
  /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
  subLabel?: string;
  /** Help text revealed inline by an info button next to the label. Needs `label`. */
  tooltip?: string;
  helperText?: string;
  /** Error message; also marks the field invalid and is announced politely. */
  errorText?: string;
  disabled?: boolean;
  /** Shows the country without opening the sheet. */
  readOnly?: boolean;
  /** Applied to the trigger; the parts add suffixes (`.flag`, `.dial`, `.search`, `.option.<iso2>`, `.close`, `.empty`, `.label`, `.helper`, `.error`). */
  testID?: string;
}>;
