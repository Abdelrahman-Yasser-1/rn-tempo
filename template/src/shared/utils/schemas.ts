import { keyFromSelector } from 'i18next';
import { z } from 'zod';

import { isValidISODate } from './calendar';
import { isValidPhone } from './phone';

/**
 * Reusable field schemas. Error messages are keys of the `validation` i18n namespace; form
 * components translate them (`t(message)` with `useTranslation('validation')`).
 */

// Messages are keys of the `validation` namespace; `keyFromSelector` keeps them type-checked and
// visible to the i18n extractor. Form fields translate them with `toKey` from `@services/i18n/keys`.
const MESSAGES = {
  dateInvalid: keyFromSelector(($) => $.date.invalid, { ns: 'validation' }),
  emailRequired: keyFromSelector(($) => $.email.required, { ns: 'validation' }),
  emailInvalid: keyFromSelector(($) => $.email.invalid, { ns: 'validation' }),
  passwordTooShort: keyFromSelector(($) => $.password.tooShort, { ns: 'validation' }),
  passwordNeedsLetter: keyFromSelector(($) => $.password.needsLetter, { ns: 'validation' }),
  passwordNeedsNumber: keyFromSelector(($) => $.password.needsNumber, { ns: 'validation' }),
  phoneInvalid: keyFromSelector(($) => $.phone.invalid, { ns: 'validation' }),
  otpInvalid: keyFromSelector(($) => $.otp.invalid, { ns: 'validation' }),
  nameTooShort: keyFromSelector(($) => $.name.tooShort, { ns: 'validation' }),
  nameTooLong: keyFromSelector(($) => $.name.tooLong, { ns: 'validation' }),
};

const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;

export const emailSchema = z
  .string()
  .trim()
  .min(1, MESSAGES.emailRequired)
  .pipe(z.email('email.invalid'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, MESSAGES.passwordTooShort)
  .regex(/\p{L}/u, MESSAGES.passwordNeedsLetter)
  .regex(/\d/, MESSAGES.passwordNeedsNumber);

export const phoneSchema = z.string().refine((value) => isValidPhone(value), MESSAGES.phoneInvalid);

export const otpSchema = z.string().regex(/^\d{6}$/, MESSAGES.otpInvalid);

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, MESSAGES.nameTooShort)
  .max(NAME_MAX_LENGTH, MESSAGES.nameTooLong);

/** A real calendar day as `YYYY-MM-DD` (the value the date pickers produce). */
export const isoDateSchema = z
  .string()
  .refine((value) => isValidISODate(value), MESSAGES.dateInvalid);
