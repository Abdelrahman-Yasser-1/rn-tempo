import { UserSchema } from '@features/auth/types';
import { request } from '@services/http/request';

import {
  LoginResponseSchema,
  OtpResendResponseSchema,
  OtpVerifyResponseSchema,
  RegisterResponseSchema,
  SuccessResponseSchema,
} from './schemas';
import type {
  ForgotPasswordRequest,
  LoginRequest,
  OtpPurpose,
  OtpVerifyRequest,
  RegisterRequest,
} from './schemas';

const ACCESS_TOKEN_TTL_MINUTES = 60;

export function login({ username, password }: Readonly<LoginRequest>) {
  return request(
    {
      method: 'POST',
      url: '/auth/login',
      data: { username, password, expiresInMins: ACCESS_TOKEN_TTL_MINUTES },
    },
    LoginResponseSchema,
  );
}

export function fetchMe() {
  return request({ method: 'GET', url: '/auth/me' }, UserSchema);
}

export function register({
  firstName,
  lastName,
  username,
  email,
  password,
}: Readonly<RegisterRequest>) {
  return request(
    {
      method: 'POST',
      url: '/users/add',
      data: { firstName, lastName, username, email, password },
    },
    RegisterResponseSchema,
  );
}

export function forgotPassword(body: Readonly<ForgotPasswordRequest>) {
  return request(
    { method: 'POST', url: '/auth/forgot-password', data: body },
    SuccessResponseSchema,
  );
}

export function verifyOtp(body: Readonly<OtpVerifyRequest>) {
  return request({ method: 'POST', url: '/auth/otp/verify', data: body }, OtpVerifyResponseSchema);
}

export function resendOtp(body: Readonly<{ target: string; purpose: OtpPurpose }>) {
  return request({ method: 'POST', url: '/auth/otp/resend', data: body }, OtpResendResponseSchema);
}
