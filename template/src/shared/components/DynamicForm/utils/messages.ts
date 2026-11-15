/**
 * Validation messages of the module, as `ns:key` strings: the `Form*` components translate an
 * error message with `t(message)`, and i18next reads the namespace from the prefix.
 */

// t('formBuilder.alphanumeric', { ns: 'validation', defaultValue: 'Use letters and numbers only.' })
// t('formBuilder.digits', { ns: 'validation', defaultValue: 'Use digits only.' })
// t('formBuilder.email', { ns: 'validation', defaultValue: 'Enter a valid email address.' })
// t('formBuilder.iban', { ns: 'validation', defaultValue: 'Enter a valid IBAN.' })
// t('formBuilder.invalid', { ns: 'validation', defaultValue: 'This value is not valid.' })
// t('formBuilder.letters', { ns: 'validation', defaultValue: 'Use letters only.' })
// t('formBuilder.noSpaces', { ns: 'validation', defaultValue: 'Do not use spaces.' })
// t('formBuilder.pattern', { ns: 'validation', defaultValue: 'This value does not match the expected format.' })
// t('formBuilder.phone', { ns: 'validation', defaultValue: 'Enter a valid phone number with country code.' })
// t('formBuilder.postalCode', { ns: 'validation', defaultValue: 'Enter a valid postal code.' })
// t('formBuilder.required', { ns: 'validation', defaultValue: 'This field is required.' })
// t('formBuilder.tooBig', { ns: 'validation', defaultValue: 'This number is too large.' })
// t('formBuilder.tooFewItems', { ns: 'validation', defaultValue: 'Add more items.' })
// t('formBuilder.tooLong', { ns: 'validation', defaultValue: 'This text is too long.' })
// t('formBuilder.tooManyItems', { ns: 'validation', defaultValue: 'Remove some items.' })
// t('formBuilder.tooShort', { ns: 'validation', defaultValue: 'This text is too short.' })
// t('formBuilder.tooSmall', { ns: 'validation', defaultValue: 'This number is too small.' })
export const VALIDATION_MESSAGES = {
  alphanumeric: 'validation:formBuilder.alphanumeric',
  digits: 'validation:formBuilder.digits',
  email: 'validation:formBuilder.email',
  iban: 'validation:formBuilder.iban',
  invalid: 'validation:formBuilder.invalid',
  letters: 'validation:formBuilder.letters',
  noSpaces: 'validation:formBuilder.noSpaces',
  pattern: 'validation:formBuilder.pattern',
  phone: 'validation:formBuilder.phone',
  postalCode: 'validation:formBuilder.postalCode',
  required: 'validation:formBuilder.required',
  tooBig: 'validation:formBuilder.tooBig',
  tooFewItems: 'validation:formBuilder.tooFewItems',
  tooLong: 'validation:formBuilder.tooLong',
  tooManyItems: 'validation:formBuilder.tooManyItems',
  tooShort: 'validation:formBuilder.tooShort',
  tooSmall: 'validation:formBuilder.tooSmall',
} as const;
