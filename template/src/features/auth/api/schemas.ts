import { keyFromSelector } from 'i18next';
import { z } from 'zod';

import { UserSchema } from '@features/auth/types';
import { emailSchema, nameSchema, passwordSchema } from '@shared/utils';

// Messages are keys of the `validation` namespace (see `@shared/utils/schemas`).
const MESSAGES = {
  usernameRequired: keyFromSelector(($) => $.username.required, { ns: 'validation' }),
  passwordRequired: keyFromSelector(($) => $.password.required, { ns: 'validation' }),
  passwordMismatch: keyFromSelector(($) => $.password.mismatch, { ns: 'validation' }),
};

const usernameSchema = z.string().trim().min(1, MESSAGES.usernameRequired);

export const LoginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, MESSAGES.passwordRequired),
});

export const LoginResponseSchema = UserSchema.extend({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const RegisterRequestSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: MESSAGES.passwordMismatch,
  });

/** dummyjson echoes the created user with a new id; only the id is relied upon. */
export const RegisterResponseSchema = z.object({ id: z.number() });

export const ForgotPasswordRequestSchema = z.object({ email: emailSchema });

export const OtpPurposeSchema = z.enum(['register', 'reset-password']);
/** Route params of Otp; validated because `tempo-dev://otp` is a public deep link. */
export const OtpRouteParamsSchema = z.object({ target: emailSchema, purpose: OtpPurposeSchema });

export const OtpVerifyResponseSchema = z.object({ success: z.boolean() });

export const OtpResendResponseSchema = z.object({
  success: z.boolean(),
  retryAfterSec: z.number().int().nonnegative(),
});

export const SuccessResponseSchema = z.object({ success: z.boolean() });

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;
export type OtpVerifyRequest = { target: string; code: string; purpose: OtpPurpose };
