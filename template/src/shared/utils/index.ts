// Barrel (contract C4).
export { formatCurrency, formatDate, formatNumber, formatRelativeTime } from './format';
export type { DateStyle } from './format';
export { haptics } from './haptics';
export { computeTooltipLayout } from './tooltipLayout';
export type { Rect, TooltipLayout, TooltipPlacement } from './tooltipLayout';
export { isValidPhone, joinE164, normalizePhone, splitE164 } from './phone';
export type { SplitPhone } from './phone';
export { isAndroid, isIOS, select } from './platform';
export { paginationRange } from './paginationRange';
export type { PageItem } from './paginationRange';
export { retry, sleep } from './retry';
export type { RetryOptions } from './retry';
export { emailSchema, nameSchema, otpSchema, passwordSchema, phoneSchema } from './schemas';
export { capitalize, initials, maskEmail, maskPhone, truncate } from './string';
export { versionCompare } from './version';
