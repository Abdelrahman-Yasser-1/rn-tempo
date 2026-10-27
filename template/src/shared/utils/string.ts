const MASK = '*';

/** Uppercases the first character. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Cuts `value` to at most `maxLength` characters, ending with `suffix` when shortened. */
export function truncate(value: string, maxLength: number, suffix = '…'): string {
  return value.length <= maxLength
    ? value
    : value.slice(0, Math.max(maxLength - suffix.length, 0)) + suffix;
}

/** Up to two uppercase initials from a name: "ada lovelace" becomes "AL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) {
    return '';
  }
  const last = words.length > 1 ? words.at(-1) : undefined;
  return [first, last]
    .map((word) => word?.charAt(0) ?? '')
    .join('')
    .toUpperCase();
}

/** Hides most of the local part: "jane.doe@mail.com" becomes "j******@mail.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at <= 0 ? email : email.charAt(0) + MASK.repeat(at - 1) + email.slice(at);
}

/** Keeps the last 4 digits: "+201234567890" becomes "+*********7890". */
export function maskPhone(phone: string): string {
  const visible = 4;
  if (phone.length <= visible) {
    return phone;
  }
  const hasPlus = phone.startsWith('+');
  const hidden = phone.length - visible - (hasPlus ? 1 : 0);
  return (hasPlus ? '+' : '') + MASK.repeat(hidden) + phone.slice(-visible);
}
