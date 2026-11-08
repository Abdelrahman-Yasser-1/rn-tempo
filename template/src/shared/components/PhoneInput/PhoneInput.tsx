import { CountryPicker } from '@shared/components/CountryPicker';
import { TextField } from '@shared/components/TextField';

import type { PhoneInputProps } from './types';
import { usePhoneInput } from './usePhoneInput';

/**
 * Phone number field: a country button (flag and dial code, which opens the country sheet) at the
 * start edge and a phone keypad input for the national number. The value is E.164. The dial code
 * stays left to right in right-to-left layouts.
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  testID,
  ...rest
}: PhoneInputProps) {
  const vm = usePhoneInput({ value, onChange, defaultCountry });

  return (
    <TextField
      {...rest}
      testID={testID}
      value={vm.nationalNumber}
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      disabled={isDisabled}
      readOnly={isReadOnly}
      left={
        <CountryPicker
          compact
          value={vm.country.iso2}
          disabled={isDisabled}
          readOnly={isReadOnly}
          testID={testID ? `${testID}.country` : undefined}
          onChange={vm.onCountryChange}
        />
      }
      onChangeText={vm.onChangeText}
    />
  );
}
