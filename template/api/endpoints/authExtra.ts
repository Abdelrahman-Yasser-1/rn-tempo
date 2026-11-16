import { defineEndpoint } from '@rn-tempo/api-contract';
import { z } from 'zod';

import {
  ForgotPasswordRequestSchema,
  OtpPurposeSchema,
  OtpResendResponseSchema,
  OtpVerifyResponseSchema,
  SuccessResponseSchema,
} from '@features/auth/api/schemas';

/** The only OTP code the mock API accepts. */
const VALID_OTP_CODE = '123456';
const RESEND_COOLDOWN_SECONDS = 60;

// Endpoints dummyjson lacks (forgot password, OTP); the real backend implements them for real.

export const forgotPassword = defineEndpoint({
  method: 'POST',
  path: '/auth/forgot-password',
  summary: 'Send a password reset code',
  tags: ['auth'],
  body: ForgotPasswordRequestSchema,
  response: SuccessResponseSchema,
  data: () => ({ success: true }),
});

export const verifyOtp = defineEndpoint({
  method: 'POST',
  path: '/auth/otp/verify',
  summary: 'Check a one-time code',
  tags: ['auth'],
  body: z.object({ target: z.string(), code: z.string(), purpose: OtpPurposeSchema }),
  response: OtpVerifyResponseSchema,
  data: ({ body }) => ({ success: body.code === VALID_OTP_CODE }),
});

export const resendOtp = defineEndpoint({
  method: 'POST',
  path: '/auth/otp/resend',
  summary: 'Send a new one-time code',
  tags: ['auth'],
  body: z.object({ target: z.string(), purpose: OtpPurposeSchema }),
  response: OtpResendResponseSchema,
  data: () => ({ success: true, retryAfterSec: RESEND_COOLDOWN_SECONDS }),
});
