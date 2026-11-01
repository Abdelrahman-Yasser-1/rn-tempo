import { emailSchema, nameSchema, otpSchema, passwordSchema, phoneSchema } from './schemas';

function messageFor(schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('emailSchema', () => {
  it('requires a value', () => {
    expect(messageFor(emailSchema, '   ')).toBe('email.required');
  });

  it('rejects malformed addresses', () => {
    expect(messageFor(emailSchema, 'not-an-email')).toBe('email.invalid');
  });

  it('accepts and trims a valid address', () => {
    expect(emailSchema.parse('  ada@example.com ')).toBe('ada@example.com');
  });
});

describe('passwordSchema', () => {
  it('requires at least 8 characters', () => {
    expect(messageFor(passwordSchema, 'a1')).toBe('password.tooShort');
  });

  it('requires a letter', () => {
    expect(messageFor(passwordSchema, '12345678')).toBe('password.needsLetter');
  });

  it('requires a digit', () => {
    expect(messageFor(passwordSchema, 'abcdefgh')).toBe('password.needsNumber');
  });

  it('accepts a password with a letter and a digit', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(true);
  });
});

describe('phoneSchema', () => {
  it('accepts E.164 numbers and rejects others', () => {
    expect(phoneSchema.safeParse('+14155550123').success).toBe(true);
    expect(messageFor(phoneSchema, '12345')).toBe('phone.invalid');
  });
});

describe('otpSchema', () => {
  it('requires exactly six digits', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(messageFor(otpSchema, '12345')).toBe('otp.invalid');
    expect(messageFor(otpSchema, '12a456')).toBe('otp.invalid');
  });
});

describe('nameSchema', () => {
  it('trims and enforces the length bounds', () => {
    expect(nameSchema.parse('  Ada  ')).toBe('Ada');
    expect(messageFor(nameSchema, 'A')).toBe('name.tooShort');
    expect(messageFor(nameSchema, 'x'.repeat(51))).toBe('name.tooLong');
  });
});
