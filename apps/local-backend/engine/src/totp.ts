import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) on `node:crypto`: HMAC-SHA1 over a time counter (RFC 4226 HOTP), six digits, 30 second steps.
 * Authenticator apps (Google Authenticator, 1Password, Authy) all use these defaults.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding, which is what an `otpauth://` secret uses. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31] ?? '';
  return out;
}

/** The bytes of a base32 text (case and spaces ignored). `undefined` when it holds another character. */
export function base32Decode(text: string): Buffer | undefined {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) return undefined;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes (160 bits, the SHA-1 block recommendation of RFC 4226) as base32. */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

/** RFC 4226 HOTP: the dynamic truncation of HMAC-SHA1(secret, counter). */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(message).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = (((mac[offset] ?? 0) & 0x7f) << 24) | ((mac[offset + 1] ?? 0) << 16) | ((mac[offset + 2] ?? 0) << 8) | (mac[offset + 3] ?? 0);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The time step a moment falls in. */
export const stepOf = (nowMs: number): number => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

export function totp(secret: Buffer, nowMs: number, digits = TOTP_DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  return hotp(secret, stepOf(nowMs), digits, algorithm);
}

/**
 * Checks a code against the steps one before to one after `nowMs` (clock drift of up to 30 seconds), comparing in
 * constant time. Returns the step that matched, so the caller can refuse a replay of the same code, or `undefined`.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, window = 1): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const now = stepOf(nowMs);
  let matched: number | undefined;
  // Every step is checked even after a match, so the time taken does not say which one was right.
  for (let step = now - window; step <= now + window; step += 1) {
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) matched ??= step;
  }
  return matched;
}

/** The `otpauth://` address an authenticator app reads from a QR code. */
export function otpauthUri(options: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.account)}`;
  const query = new URLSearchParams({ secret: options.secret, issuer: options.issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${query.toString()}`;
}
