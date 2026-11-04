import { useState } from 'react';

import { DEFAULT_COUNTRY_ISO2 } from '@shared/constants/countries';
import type { Country } from '@shared/constants/countries';
import { FALLBACK_COUNTRY, findCountry } from '@shared/utils/countries';
import { joinE164, splitE164 } from '@shared/utils/phone';

import type { PhoneInputProps } from './types';

const stripTrunkZero = (digits: string) => digits.replace(/^0+/, '');

/**
 * Logic of the phone input. The value is E.164, so the country is parsed from it; the country the
 * user picked (and the digits as typed, trunk zero included) are kept locally because an empty or
 * partial number can't carry them.
 */
export function usePhoneInput({
  value,
  onChange,
  defaultCountry = DEFAULT_COUNTRY_ISO2,
}: Pick<PhoneInputProps, 'value' | 'onChange' | 'defaultCountry'>) {
  const [pickedIso2, setPickedIso2] = useState<string | undefined>();
  const [typed, setTyped] = useState('');

  const parsed = splitE164(value);
  const picked = findCountry(pickedIso2);
  // A picked country wins over the parsed one when they share a dial code (e.g. +1: US or CA).
  const country: Country =
    (parsed.country && picked?.dialCode === parsed.country.dialCode ? picked : parsed.country) ??
    picked ??
    findCountry(defaultCountry) ??
    FALLBACK_COUNTRY;
  const isInSync = joinE164(country.dialCode, typed) === value;
  const nationalNumber = isInSync ? typed : parsed.nationalNumber;

  const emit = (next: Country, digits: string) => {
    onChange(joinE164(next.dialCode, digits), {
      country: next,
      nationalNumber: stripTrunkZero(digits),
    });
  };

  const onChangeText = (input: string) => {
    const trimmed = input.trim();
    // A pasted international number (`+…` or `00…`) switches the country by its dial code.
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      const pasted = splitE164(trimmed);
      if (pasted.country) {
        setPickedIso2(pasted.country.iso2);
        setTyped(pasted.nationalNumber);
        emit(pasted.country, pasted.nationalNumber);
        return;
      }
    }
    const digits = input.replaceAll(/\D/g, '');
    setTyped(digits);
    emit(country, digits);
  };

  const onCountryChange = (next: Country) => {
    setPickedIso2(next.iso2);
    emit(next, nationalNumber);
  };

  return { country, nationalNumber, onChangeText, onCountryChange };
}
