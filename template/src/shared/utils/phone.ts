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
