import {
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  OtpPurposeSchema,
  OtpResendResponseSchema,
  OtpRouteParamsSchema,
  OtpVerifyResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from './schemas';

const VALID_REGISTER = {
  firstName: 'Emily',
  lastName: 'Johnson',
  username: 'emilys',
  email: 'emily@example.test',
  password: 'secret123',
  confirmPassword: 'secret123',
};

describe('auth schemas', () => {
  test('login requires a username and a password, and trims the username', () => {
    expect(LoginRequestSchema.parse({ username: '  emilys ', password: 'x' })).toEqual({
      username: 'emilys',
      password: 'x',
    });
    expect(LoginRequestSchema.safeParse({ username: '   ', password: 'x' }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ username: 'emilys', password: '' }).success).toBe(false);
  });

  test('register accepts a complete matching form', () => {
    expect(RegisterRequestSchema.safeParse(VALID_REGISTER).success).toBe(true);
  });

  test('register rejects a password without a digit', () => {
    const result = RegisterRequestSchema.safeParse({
      ...VALID_REGISTER,
      password: 'secretabc',
      confirmPassword: 'secretabc',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain('password.needsNumber');
  });

  test('register reports a mismatch on confirmPassword only', () => {
    const result = RegisterRequestSchema.safeParse({
      ...VALID_REGISTER,
      confirmPassword: 'other123',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['confirmPassword'], message: 'password.mismatch' }),
    ]);
  });

  test('the register response only relies on the new id', () => {
    expect(RegisterResponseSchema.parse({ id: 209, extra: 'ignored' })).toEqual({ id: 209 });
  });

  test('forgot password requires a valid email', () => {
    expect(ForgotPasswordRequestSchema.safeParse({ email: 'emily@example.test' }).success).toBe(
      true,
    );
    expect(ForgotPasswordRequestSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });

  test('OTP purposes are limited to register and reset-password', () => {
    expect(OtpPurposeSchema.safeParse('register').success).toBe(true);
    expect(OtpPurposeSchema.safeParse('reset-password').success).toBe(true);
    expect(OtpPurposeSchema.safeParse('admin').success).toBe(false);
  });

  test('OTP route params reject a forged purpose or target', () => {
    expect(
      OtpRouteParamsSchema.parse({ target: ' emily@example.test ', purpose: 'register' }),
    ).toEqual({ target: 'emily@example.test', purpose: 'register' });
    expect(OtpRouteParamsSchema.safeParse({ target: 'x', purpose: 'register' }).success).toBe(
      false,
    );
    expect(
      OtpRouteParamsSchema.safeParse({ target: 'emily@example.test', purpose: 'admin' }).success,
    ).toBe(false);
  });

  test('OTP responses validate their shape', () => {
    expect(OtpVerifyResponseSchema.safeParse({ success: true }).success).toBe(true);
    expect(OtpVerifyResponseSchema.safeParse({}).success).toBe(false);
    expect(OtpResendResponseSchema.safeParse({ success: true, retryAfterSec: 60 }).success).toBe(
      true,
    );
    expect(OtpResendResponseSchema.safeParse({ success: true, retryAfterSec: -1 }).success).toBe(
      false,
    );
    expect(OtpResendResponseSchema.safeParse({ success: true, retryAfterSec: 1.5 }).success).toBe(
      false,
    );
  });
});
