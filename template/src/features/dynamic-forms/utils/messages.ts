/**
 * Validation messages of the module, as `ns:key` strings: the `Form*` components translate an
 * error message with `t(message)`, and i18next reads the namespace from the prefix.
 */

// t('validation.email', { ns: 'forms', defaultValue: 'Enter a valid email address.' })
// t('validation.invalid', { ns: 'forms', defaultValue: 'This value is not valid.' })
// t('validation.pattern', { ns: 'forms', defaultValue: 'This value does not match the expected format.' })
// t('validation.phone', { ns: 'forms', defaultValue: 'Enter a valid phone number with country code.' })
// t('validation.required', { ns: 'forms', defaultValue: 'This field is required.' })
// t('validation.tooBig', { ns: 'forms', defaultValue: 'This number is too large.' })
// t('validation.tooFewItems', { ns: 'forms', defaultValue: 'Add more items.' })
// t('validation.tooLong', { ns: 'forms', defaultValue: 'This text is too long.' })
// t('validation.tooManyItems', { ns: 'forms', defaultValue: 'Remove some items.' })
// t('validation.tooShort', { ns: 'forms', defaultValue: 'This text is too short.' })
// t('validation.tooSmall', { ns: 'forms', defaultValue: 'This number is too small.' })
export const VALIDATION_MESSAGES = {
  email: 'forms:validation.email',
  invalid: 'forms:validation.invalid',
  pattern: 'forms:validation.pattern',
  phone: 'forms:validation.phone',
  required: 'forms:validation.required',
  tooBig: 'forms:validation.tooBig',
  tooFewItems: 'forms:validation.tooFewItems',
  tooLong: 'forms:validation.tooLong',
  tooManyItems: 'forms:validation.tooManyItems',
  tooShort: 'forms:validation.tooShort',
  tooSmall: 'forms:validation.tooSmall',
} as const;
