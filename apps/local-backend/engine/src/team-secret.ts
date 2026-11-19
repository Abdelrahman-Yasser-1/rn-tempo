import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { DefinitionError } from './schema.ts';

export const SERVER_SECRET_FILE = 'server-secret.json';

/**
 * The server secret: 32 random bytes in `<data dir>/server-secret.json`, created on the first start with
 * `O_EXCL | O_NOFOLLOW` and mode 0600 (a planted link or a racing process cannot redirect the write), then read back
 * the same no-follow way. It only protects what is stored in `server.sqlite` (TOTP secrets, recovery codes). It is
 * never logged and no route returns it. Back it up together with the database: without it every TOTP stops working.
 */
export function loadServerSecret(dir: string): Buffer {
  const path = join(dir, SERVER_SECRET_FILE);
  try {
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      writeSync(fd, `${JSON.stringify({ serverSecret: randomBytes(32).toString('base64url') }, null, 2)}\n`);
      fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (lstatSync(path).isSymbolicLink()) throw new DefinitionError(`${SERVER_SECRET_FILE} is a symbolic link and is not used.`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new DefinitionError(`${SERVER_SECRET_FILE} is not a file.`);
    fchmodSync(fd, 0o600);
    const parsed: unknown = JSON.parse(readFileSync(fd, 'utf8'));
    const value = typeof parsed === 'object' && parsed !== null ? (parsed as { serverSecret?: unknown }).serverSecret : undefined;
    const secret = typeof value === 'string' ? Buffer.from(value, 'base64url') : Buffer.alloc(0);
    if (secret.length < 32) throw new DefinitionError(`${SERVER_SECRET_FILE} does not hold a usable secret. Restore it from a backup: a new one would make every stored TOTP secret unreadable.`);
    return secret;
  } finally {
    closeSync(fd);
  }
}

/** Separate keys for separate jobs, all derived from the one secret (HKDF-SHA256). */
const derive = (secret: Buffer, purpose: string): Buffer => Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `tempo-local-backend/${purpose}/v1`, 32));

/** AES-256-GCM. The result is `v1.<iv>.<tag>.<ciphertext>` (base64url); `context` is authenticated but not stored. */
export function encryptText(secret: Buffer, plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(secret, 'totp'), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** The text again, or `undefined` when the value is malformed, was made for another context, or the key is wrong. */
export function decryptText(secret: Buffer, stored: string, context: string): string | undefined {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || iv === undefined || tag === undefined || body === undefined) return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(secret, 'totp'), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

/** A keyed hash for recovery codes: a stolen database alone cannot be searched for codes. */
export const hashCode = (secret: Buffer, code: string): string => createHmac('sha256', derive(secret, 'recovery')).update(code).digest('hex');
