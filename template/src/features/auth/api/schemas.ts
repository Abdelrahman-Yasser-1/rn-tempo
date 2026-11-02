import { z } from 'zod';

import { emailSchema, nameSchema, passwordSchema } from '@shared/utils';

import { UserSchema } from '../types';

// Keys of the `validation` namespace, declared here so the i18n extractor keeps them.
// t('username.required', { ns: 'validation', defaultValue: 'Enter your username.' })
// t('password.required', { ns: 'validation', defaultValue: 'Enter your password.' })
// t('password.mismatch', { ns: 'validation', defaultValue: 'Passwords do not match.' })

const usernameSchema = z.string().trim().min(1, 'username.required');

export const LoginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'password.required'),
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
    message: 'password.mismatch',
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
