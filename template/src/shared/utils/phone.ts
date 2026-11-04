import { COUNTRIES, PRIMARY_ISO2_BY_DIAL_CODE } from '@shared/constants/countries';
import type { Country } from '@shared/constants/countries';

const E164 = /^\+[1-9]\d{7,14}$/;

/** Strips spaces, dashes, dots and parentheses; keeps a leading `+`. A `00` prefix becomes `+`. */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replaceAll(/[\s\-().]/g, '');
  return cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
}

/** Whether `phone` is a valid E.164 number after normalization (`+` and 8 to 15 digits). */
export function isValidPhone(phone: string): boolean {
  return E164.test(normalizePhone(phone));
}

export type SplitPhone = Readonly<{
  /** The country whose dial code is the longest prefix, or `undefined` when none matches. */
  country: Country | undefined;
  /** Digits after the dial code (all digits when there is no country). */
  nationalNumber: string;
}>;

const DIAL_CODES_BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

/**
 * Splits an E.164 number into its country and national number by the longest matching dial code.
 * Countries sharing a code (+1, +7, +44 ...) resolve to the primary one.
 */
export function splitE164(e164: string): SplitPhone {
  const normalized = normalizePhone(e164);
  const digits = normalized.replaceAll(/\D/g, '');
  if (!normalized.startsWith('+')) {
    return { country: undefined, nationalNumber: digits };
  }
  const longest = DIAL_CODES_BY_LENGTH.find((country) =>
    normalized.startsWith(country.dialCode),
  )?.dialCode;
  if (longest === undefined) {
    return { country: undefined, nationalNumber: digits };
  }
  const candidates = COUNTRIES.filter((country) => country.dialCode === longest);
  const primary = PRIMARY_ISO2_BY_DIAL_CODE[longest];
  const country = candidates.find((candidate) => candidate.iso2 === primary) ?? candidates[0];
  return { country, nationalNumber: digits.slice(longest.length - 1) };
}

/**
 * Joins a dial code and a national number into E.164. Non-digits and leading zeros (the national
 * trunk prefix, as in `05...`) are dropped. An empty national number gives an empty string.
 */
export function joinE164(dialCode: string, nationalNumber: string): string {
  const digits = nationalNumber.replaceAll(/\D/g, '').replace(/^0+/, '');
  return digits === '' ? '' : `${dialCode}${digits}`;
}
