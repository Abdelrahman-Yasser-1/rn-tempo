import { createHmac } from 'node:crypto';
import { mkdtempSync, statSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { redactDeep } from '../src/shared/redact.ts';
import { describe, expect, it } from 'vitest';

import { hashPassword, hashPasswordSync, loadJwtSecret, signAccessToken, verifyAccessToken, verifyPassword } from '../src/tokens.ts';

const secret = Buffer.alloc(32, 7);
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const enc = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
/** A token signed with the right secret but with a header and claims of our choosing. */
function forge(header: unknown, claims: unknown, key: Buffer = secret): string {
  const input = `${enc(header)}.${enc(claims)}`;
  return `${input}.${createHmac('sha256', key).update(input).digest('base64url')}`;
}
const goodClaims = { sub: '1', iat: NOW / 1000, exp: NOW / 1000 + 600, typ: 'access', ver: 0 };

describe('scrypt passwords', () => {
  it('hashes with a salt and the parameters in the string, and verifies', async () => {
    const a = await hashPassword('emilyspass');
    const b = hashPasswordSync('emilyspass');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b); // a fresh salt each time
    expect(a).not.toContain('emilyspass');
    expect(await verifyPassword('emilyspass', a)).toBe(true);
    expect(await verifyPassword('emilyspass', b)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
  });

  it('never matches a missing, malformed or hostile hash', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$3$8$1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA')).toBe(false); // N not a power of two
    expect(await verifyPassword('x', 'scrypt$1073741824$8$1$AAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA')).toBe(false); // N too large
    expect(await verifyPassword('x'.repeat(5000), await hashPassword('x'))).toBe(false);
  });
});

describe('JWT HS256', () => {
  it('signs and verifies { sub, iat, exp, typ }', () => {
    const token = signAccessToken(secret, '42', 600, NOW);
    expect(token.split('.')).toHaveLength(3);
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()) as unknown;
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    const result = verifyAccessToken(secret, token, NOW + 1000);
    expect(result).toEqual({ ok: true, claims: { sub: '42', iat: NOW / 1000, exp: NOW / 1000 + 600, typ: 'access', ver: 0 } });
  });

  it('rejects an expired token', () => {
    expect(verifyAccessToken(secret, signAccessToken(secret, '1', 60, NOW), NOW + 61_000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects alg none, even unsigned or with an empty signature', () => {
    const unsigned = `${enc({ alg: 'none', typ: 'JWT' })}.${enc(goodClaims)}.`;
    expect(verifyAccessToken(secret, unsigned, NOW).ok).toBe(false);
    expect(verifyAccessToken(secret, `${enc({ alg: 'none' })}.${enc(goodClaims)}.AAAA`, NOW)).toEqual({ ok: false, reason: 'algorithm' });
  });

  it('rejects any alg other than HS256 even when the signature is right', () => {
    expect(verifyAccessToken(secret, forge({ alg: 'HS512', typ: 'JWT' }, goodClaims), NOW)).toEqual({ ok: false, reason: 'algorithm' });
    expect(verifyAccessToken(secret, forge({ alg: 'hs256', typ: 'JWT' }, goodClaims), NOW)).toEqual({ ok: false, reason: 'algorithm' });
    expect(verifyAccessToken(secret, forge({ typ: 'JWT' }, goodClaims), NOW)).toEqual({ ok: false, reason: 'algorithm' });
  });

  it('rejects a bad signature, another secret and a tampered payload', () => {
    const token = signAccessToken(secret, '1', 600, NOW);
    const [h, p, s] = token.split('.') as [string, string, string];
    expect(verifyAccessToken(secret, `${h}.${p}.${s.slice(0, -2)}AA`, NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyAccessToken(Buffer.alloc(32, 8), token, NOW)).toEqual({ ok: false, reason: 'signature' });
    const admin = enc({ ...goodClaims, sub: '2' });
    expect(verifyAccessToken(secret, `${h}.${admin}.${s}`, NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyAccessToken(secret, `${h}.${p}.`, NOW).ok).toBe(false);
  });

  it('rejects a bad exp: missing, not a number, before iat, or not finite', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    for (const exp of [undefined, '9999999999', null, true, goodClaims.iat, goodClaims.iat - 5, 1e999]) {
      const claims = { ...goodClaims, exp };
      expect(verifyAccessToken(secret, forge(header, claims), NOW).ok, JSON.stringify(exp)).toBe(false);
    }
  });

  it('rejects wrong claims: typ, sub, iat', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    expect(verifyAccessToken(secret, forge(header, { ...goodClaims, typ: 'refresh' }), NOW)).toEqual({ ok: false, reason: 'claims' });
    expect(verifyAccessToken(secret, forge(header, { ...goodClaims, sub: 5 }), NOW)).toEqual({ ok: false, reason: 'claims' });
    expect(verifyAccessToken(secret, forge(header, { ...goodClaims, iat: 'now' }), NOW)).toEqual({ ok: false, reason: 'claims' });
    expect(verifyAccessToken(secret, forge(header, { ...goodClaims, ver: undefined }), NOW)).toEqual({ ok: false, reason: 'claims' });
    expect(verifyAccessToken(secret, forge(header, { ...goodClaims, ver: 1.5 }), NOW)).toEqual({ ok: false, reason: 'claims' });
    expect(verifyAccessToken(secret, signAccessToken(secret, '1', 60, NOW, 3), NOW)).toMatchObject({ ok: true, claims: { ver: 3 } });
  });

  it('rejects malformed input', () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c.d', '..', 'a b.c.d', '%%%.%%%.%%%']) expect(verifyAccessToken(secret, token, NOW).ok).toBe(false);
  });
});

describe('.data/secrets.json', () => {
  const dataDir = (): string => mkdtempSync(join(tmpdir(), 'lb-secret-'));

  it('is created once with 32 random bytes and mode 0600, then reused', () => {
    const dir = dataDir();
    const first = loadJwtSecret(dir);
    expect(first).toHaveLength(32);
    expect(statSync(join(dir, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(loadJwtSecret(dir).equals(first)).toBe(true);
    expect(loadJwtSecret(dataDir()).equals(first)).toBe(false);
  });

  it('refuses a symbolic link, and a file without a usable secret', () => {
    const dir = dataDir();
    const target = join(dir, 'elsewhere.json');
    writeFileSync(target, '{}');
    symlinkSync(target, join(dir, 'secrets.json'));
    expect(() => loadJwtSecret(dir)).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('{}'); // nothing was written through the link
    const other = dataDir();
    writeFileSync(join(other, 'secrets.json'), JSON.stringify({ jwtSecret: 'short' }));
    expect(() => loadJwtSecret(other)).toThrow(/jwtSecret/);
  });
});

describe('log redaction keys', () => {
  it('hides hashes, passwords, tokens and the jwt secret at any depth', () => {
    const redacted = JSON.stringify(
      redactDeep({ user: { passwordHash: 'a', password: 'b', currentPassword: 'c', confirmPassword: 'd' }, tokenHash: 'e', refreshToken: 'f', accessToken: 'g', jwtSecret: 'h', keep: 'visible' }),
    );
    for (const hidden of ['"a"', '"b"', '"c"', '"d"', '"e"', '"f"', '"g"', '"h"']) expect(redacted).not.toContain(hidden);
    expect(redacted).toContain('visible');
  });
});
