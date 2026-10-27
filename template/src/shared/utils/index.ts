// Barrel (contract C4).
export { formatCurrency, formatDate, formatNumber, formatRelativeTime } from './format';
export type { DateStyle } from './format';
export { haptics } from './haptics';
export { isValidPhone, normalizePhone } from './phone';
export { isAndroid, isIOS, select } from './platform';
export { retry, sleep } from './retry';
export type { RetryOptions } from './retry';
export { emailSchema, nameSchema, otpSchema, passwordSchema, phoneSchema } from './schemas';
export { capitalize, initials, maskEmail, maskPhone, truncate } from './string';
export { versionCompare } from './version';
