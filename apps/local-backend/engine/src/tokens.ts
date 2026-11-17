import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { DefinitionError } from './schema.ts';

interface ScryptOptions {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, key) => (error === null ? resolve(key) : reject(error)));
  });
}

// ---- passwords

const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64, saltBytes: 16 } as const;
/** Longest password hashed; a longer one is refused before it costs CPU. */
export const MAX_PASSWORD_LENGTH = 256;
const maxmem = (n: number, r: number): number => 129 * n * r + 1024 * 1024;
const optionsFor = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: maxmem(n, r) });

const b64 = (buffer: Buffer): string => buffer.toString('base64url');

/** `scrypt$N$r$p$<salt>$<hash>`: the parameters travel with the hash, so they can change later. */
const encodeHash = (salt: Buffer, hash: Buffer): string => `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(hash)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  return encodeHash(salt, await scryptAsync(password, salt, SCRYPT.keylen, optionsFor(SCRYPT.N, SCRYPT.r, SCRYPT.p)));
}

/** The blocking twin, used while seeding at start-up. */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SCRYPT.saltBytes);
  return encodeHash(salt, scryptSync(password, salt, SCRYPT.keylen, optionsFor(SCRYPT.N, SCRYPT.r, SCRYPT.p)));
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return undefined;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((value) => Number.isInteger(value) && value > 0) || n > 1 << 20 || r > 32 || p > 16 || (n & (n - 1)) !== 0) return undefined;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const hash = Buffer.from(parts[5] ?? '', 'base64url');
  return salt.length >= 8 && hash.length >= 16 ? { n, r, p, salt, hash } : undefined;
}

/** Checks a password against a stored hash in constant time. A malformed or missing hash never matches. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = stored === null ? undefined : parseHash(stored);
  if (parsed === undefined || password.length > MAX_PASSWORD_LENGTH) {
    // Same work as a real check, so a missing user and a wrong password take about the same time.
    await scryptAsync(password.slice(0, MAX_PASSWORD_LENGTH), Buffer.alloc(16), SCRYPT.keylen, optionsFor(SCRYPT.N, SCRYPT.r, SCRYPT.p));
    return false;
  }
  const hash = await scryptAsync(password, parsed.salt, parsed.hash.length, optionsFor(parsed.n, parsed.r, parsed.p));
  return hash.length === parsed.hash.length && timingSafeEqual(hash, parsed.hash);
}

export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

/** An opaque random token (refresh tokens). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

// ---- JWT (HS256)

export interface AccessClaims {
  sub: string;
  iat: number;
  exp: number;
  typ: 'access';
}

const encodeJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (secret: Buffer, input: string): Buffer => createHmac('sha256', secret).update(input).digest();

/** Signs `{ sub, iat, exp, typ: 'access' }` as a compact HS256 JWT. */
export function signAccessToken(secret: Buffer, subject: string, ttlSeconds: number, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const claims: AccessClaims = { sub: subject, iat, exp: iat + ttlSeconds, typ: 'access' };
  const input = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  return `${input}.${b64(sign(secret, input))}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function decodeJson(part: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export type VerifyFailure = 'malformed' | 'algorithm' | 'signature' | 'claims' | 'expired';

/**
 * Verifies a compact JWT. Only `alg: HS256` is accepted (never `none`, never another algorithm), the
 * signature is compared in constant time, and `exp` must be a finite number in the future.
 */
export function verifyAccessToken(secret: Buffer, token: string, nowMs: number): { ok: true; claims: AccessClaims } | { ok: false; reason: VerifyFailure } {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part === '' || !/^[A-Za-z0-9_-]+$/.test(part))) return { ok: false, reason: 'malformed' };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson(headerPart);
  if (header === undefined) return { ok: false, reason: 'malformed' };
  if (header.alg !== 'HS256') return { ok: false, reason: 'algorithm' };
  const expected = sign(secret, `${headerPart}.${payloadPart}`);
  const given = Buffer.from(signaturePart, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };
  const payload = decodeJson(payloadPart);
  if (payload === undefined) return { ok: false, reason: 'malformed' };
  const { sub, iat, exp, typ } = payload;
  if (typeof sub !== 'string' || sub === '' || typ !== 'access' || typeof iat !== 'number' || !Number.isFinite(iat)) return { ok: false, reason: 'claims' };
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= iat) return { ok: false, reason: 'claims' };
  if (exp <= nowMs / 1000) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { sub, iat, exp, typ: 'access' } };
}

// ---- the per-backend secret

export const SECRETS_FILE = 'secrets.json';

/**
 * Reads the JWT secret from `.data/secrets.json`, creating it on first start: 32 random bytes, created with
 * `O_EXCL | O_NOFOLLOW` and mode 0600, so a planted link or a racing process cannot redirect the write.
 * The secret is never logged and no route returns it.
 */
export function loadJwtSecret(dataDir: string): Buffer {
  const path = join(dataDir, SECRETS_FILE);
  try {
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, `${JSON.stringify({ jwtSecret: randomBytes(32).toString('base64url') }, null, 2)}\n`);
      fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (lstatSync(path).isSymbolicLink()) throw new DefinitionError(`.data/${SECRETS_FILE} is a symbolic link and is not used.`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new DefinitionError(`.data/${SECRETS_FILE} is not a file.`);
    fchmodSync(fd, 0o600);
    const parsed: unknown = JSON.parse(readFileSync(fd, 'utf8'));
    const value = isRecord(parsed) ? parsed.jwtSecret : undefined;
    const secret = typeof value === 'string' ? Buffer.from(value, 'base64url') : Buffer.alloc(0);
    if (secret.length < 32) throw new DefinitionError(`.data/${SECRETS_FILE} does not hold a usable jwtSecret. Remove the file to make a new one (everyone is signed out).`);
    return secret;
  } finally {
    closeSync(fd);
  }
}
