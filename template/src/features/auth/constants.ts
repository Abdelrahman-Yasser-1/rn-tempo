/**
 * Credentials of dummyjson's public demo account, shown as a hint in dev mock builds only.
 * Safe to commit: they are published in dummyjson's own docs and guard no real data.
 */
export const DEV_HINT_CREDENTIALS = { username: 'emilys', password: 'emilyspass' } as const;

/** Seconds before an OTP code can be requested again. */
export const OTP_RESEND_SECONDS = 60;

export const OTP_LENGTH = 6;
