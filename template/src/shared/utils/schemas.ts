import { z } from 'zod';

import { isValidPhone } from './phone';

/**
 * Reusable field schemas. Error messages are keys of the `validation` i18n namespace; form
 * components translate them (`t(message)` with `useTranslation('validation')`).
 */

// Keys of the `validation` namespace, declared here so the i18n extractor keeps them.
// t('email.required', { ns: 'validation', defaultValue: 'Enter your email address.' })
// t('email.invalid', { ns: 'validation', defaultValue: 'Enter a valid email address.' })
// t('password.tooShort', { ns: 'validation', defaultValue: 'Use at least 8 characters.' })
// t('password.needsLetter', { ns: 'validation', defaultValue: 'Include at least one letter.' })
// t('password.needsNumber', { ns: 'validation', defaultValue: 'Include at least one number.' })
// t('phone.invalid', { ns: 'validation', defaultValue: 'Enter a valid phone number with country code.' })
// t('otp.invalid', { ns: 'validation', defaultValue: 'Enter the 6-digit code.' })
// t('name.tooShort', { ns: 'validation', defaultValue: 'Enter at least 2 characters.' })
// t('name.tooLong', { ns: 'validation', defaultValue: 'Use at most 50 characters.' })

const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'email.required')
  .pipe(z.email('email.invalid'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'password.tooShort')
  .regex(/\p{L}/u, 'password.needsLetter')
  .regex(/\d/, 'password.needsNumber');

export const phoneSchema = z.string().refine((value) => isValidPhone(value), 'phone.invalid');

export const otpSchema = z.string().regex(/^\d{6}$/, 'otp.invalid');

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, 'name.tooShort')
  .max(NAME_MAX_LENGTH, 'name.tooLong');
