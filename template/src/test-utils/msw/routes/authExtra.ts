import type { MockRoute } from './types';

/** The only OTP code the mock API accepts. */
const VALID_OTP_CODE = '123456';
const RESEND_COOLDOWN_SECONDS = 60;

const asRecord = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

/** Endpoints dummyjson lacks (forgot password, OTP); available only with `API_MOCKING=true`. */
export const authExtraRoutes: MockRoute[] = [
  {
    method: 'post',
    path: '/auth/forgot-password',
    resolve: () => ({ status: 200, body: { success: true } }),
  },
  {
    method: 'post',
    path: '/auth/otp/verify',
    resolve: ({ body }) => ({
      status: 200,
      body: { success: asRecord(body).code === VALID_OTP_CODE },
    }),
  },
  {
    method: 'post',
    path: '/auth/otp/resend',
    resolve: () => ({
      status: 200,
      body: { success: true, retryAfterSec: RESEND_COOLDOWN_SECONDS },
    }),
  },
];
