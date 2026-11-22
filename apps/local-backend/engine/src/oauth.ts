import { createHash, createPrivateKey, createPublicKey, createSign, generateKeyPairSync, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Accounts, UserRecord } from './accounts.ts';
import type { AuthService } from './auth.ts';
import { jsonReply, type Reply, type RequestCtx } from './http.ts';
import type { Backend } from './schema.ts';
import { newSecret, type SecretStore } from './secrets.ts';

/** An authorization code lives this long and works once. */
export const CODE_TTL_MS = 60_000;
const MAX_CODES = 1000;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const b64 = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

interface Code {
  clientId: string;
  redirectUri: string;
  userId: number;
  challenge: string;
  scope: string;
  nonce: string | undefined;
  expires: number;
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** The claim names a provider preset uses in the ID token and in `userinfo`. */
export function claimsFor(provider: string, user: UserRecord): Record<string, unknown> {
  const name = `${user.firstName} ${user.lastName}`.trim() || user.username;
  const email = user.email ?? `${user.username}@example.com`;
  switch (provider) {
    case 'apple':
      // Apple sends booleans as strings and only an email (the name comes once, outside the token).
      return { sub: String(user.id), email, email_verified: 'true', is_private_email: 'false' };
    case 'github':
      return { sub: String(user.id), id: user.id, login: user.username, name, email, avatar_url: user.image };
    case 'generic':
      return { sub: String(user.id), preferred_username: user.username, name, email };
    default:
      return { sub: String(user.id), email, email_verified: true, name, given_name: user.firstName, family_name: user.lastName, picture: user.image };
  }
}

export interface OauthDeps {
  definition: () => Backend;
  auth: AuthService;
  accounts: Accounts;
  secrets: SecretStore;
  now: () => Date;
  /** `/b/<id>` on a team server, else empty. */
  prefix: string;
}

const oauthError = (status: number, error: string, description: string, headers: Record<string, string> = {}): Reply =>
  jsonReply(status, { error, error_description: description }, { 'cache-control': 'no-store', pragma: 'no-cache', ...headers });

/**
 * A mock OAuth 2.0 / OpenID Connect provider for the backend's app users: authorization code with PKCE (S256 only),
 * refresh tokens, `userinfo`, discovery and a JWKS for the RS256 ID token. It issues the backend's own access and
 * refresh tokens, so the token it hands out also works on the backend's `bearer` endpoints. Not implemented: implicit and
 * password grants, `plain` PKCE, consent screens, scopes beyond `openid profile email`, token introspection or revocation,
 * dynamic client registration, JWKS key rotation.
 */
export class OauthService {
  private readonly deps: OauthDeps;
  private readonly codes = new Map<string, Code>();

  constructor(deps: OauthDeps) {
    this.deps = deps;
  }

  private config(): NonNullable<Backend['oauth']> | undefined {
    const oauth = this.deps.definition().oauth;
    return oauth?.enabled === true ? oauth : undefined;
  }

  // ---- keys and secrets

  /** The RS256 signing key, made on first use and kept in `.data/secrets.json`. */
  private signingKey(): { pem: string; kid: string; jwk: Record<string, unknown> } {
    const stored = this.deps.secrets.section('oauth').signingKey;
    let pem: string;
    if (typeof stored === 'string') pem = stored;
    else {
      const made = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      this.deps.secrets.setSection('oauth', (section) => {
        section.signingKey = made;
      });
      pem = made;
    }
    const jwk = createPublicKey(createPrivateKey(pem)).export({ format: 'jwk' }) as Record<string, unknown>;
    const kid = createHash('sha256').update(String(jwk.n)).digest('base64url').slice(0, 16);
    return { pem, kid, jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } };
  }

  private secretOf(clientId: string): string | undefined {
    const value = (this.deps.secrets.section('oauth').clientSecrets as Record<string, unknown> | undefined)?.[clientId];
    return typeof value === 'string' ? value : undefined;
  }

  hasSecret(clientId: string): boolean {
    return this.secretOf(clientId) !== undefined;
  }

  /** Makes (or replaces) a client's secret and returns it, once. A client with a secret must present it at the token endpoint. */
  rotateSecret(clientId: string): string {
    const made = newSecret('cs');
    this.deps.secrets.setSection('oauth', (section) => {
      const secrets = (typeof section.clientSecrets === 'object' && section.clientSecrets !== null ? section.clientSecrets : {}) as Record<string, string>;
      secrets[clientId] = made;
      section.clientSecrets = secrets;
    });
    return made;
  }

  removeSecret(clientId: string): void {
    this.deps.secrets.setSection('oauth', (section) => {
      const secrets = section.clientSecrets as Record<string, string> | undefined;
      if (secrets !== undefined) delete secrets[clientId];
      if (secrets !== undefined && Object.keys(secrets).length === 0) delete section.clientSecrets;
    });
  }

  // ---- routing

  /** The addresses of the provider as an app would configure them. */
  endpoints(origin: string): Record<string, string> {
    const base = `${origin}${this.deps.prefix}${this.deps.definition().basePath ?? ''}`;
    return {
      issuer: base,
      authorizationEndpoint: `${base}/oauth/authorize`,
      tokenEndpoint: `${base}/oauth/token`,
      userinfoEndpoint: `${base}/oauth/userinfo`,
      jwksUri: `${base}/oauth/jwks`,
      discovery: `${base}/.well-known/openid-configuration`,
    };
  }

  /** Answers a request for one of the provider's addresses, or `undefined` when the path is not one (or OAuth is off). */
  handle(ctx: RequestCtx): Reply | undefined {
    const oauth = this.config();
    if (oauth === undefined) return undefined;
    const base = this.deps.definition().basePath ?? '';
    if (!ctx.path.startsWith(base)) return undefined;
    const path = ctx.path.slice(base.length);
    const origin = ctx.origin ?? 'http://localhost';
    switch (path) {
      case '/.well-known/openid-configuration':
        return ctx.method === 'GET' ? this.discovery(origin) : undefined;
      case '/oauth/jwks':
        return ctx.method === 'GET' ? jsonReply(200, { keys: [this.signingKey().jwk] }, { 'cache-control': 'public, max-age=60' }) : undefined;
      case '/oauth/authorize':
        return ctx.method === 'GET' || ctx.method === 'POST' ? this.authorize(ctx, oauth) : undefined;
      case '/oauth/token':
        if (ctx.method !== 'POST') return undefined;
        ctx.bodyNote = `[${String(Buffer.byteLength(ctx.bodyText))} bytes of token request]`;
        return this.token(ctx, oauth, origin);
      case '/oauth/userinfo':
        return ctx.method === 'GET' || ctx.method === 'POST' ? this.userinfo(ctx, oauth) : undefined;
      default:
        return undefined;
    }
  }

  private discovery(origin: string): Reply {
    const e = this.endpoints(origin);
    return jsonReply(200, {
      issuer: e.issuer,
      authorization_endpoint: e.authorizationEndpoint,
      token_endpoint: e.tokenEndpoint,
      userinfo_endpoint: e.userinfoEndpoint,
      jwks_uri: e.jwksUri,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: Object.keys(claimsFor(this.config()?.provider ?? 'google', { id: 1, username: 'u', email: 'e', firstName: '', lastName: '', image: '' } as UserRecord)),
    });
  }

  // ---- authorize

  private params(ctx: RequestCtx): URLSearchParams {
    return ctx.method === 'POST' ? new URLSearchParams(ctx.bodyText) : ctx.query;
  }

  private page(status: number, body: string): Reply {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in (mock)</title><style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem}button{display:block;width:100%;margin:.4rem 0;padding:.6rem;font:inherit;text-align:left;cursor:pointer}.deny{margin-top:1.2rem}small{color:#555}</style></head><body>${body}</body></html>`;
    return {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // No scripts at all, and the page is sandboxed (forms only): it can run nothing and has no origin of its own.
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; sandbox allow-forms",
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
      },
      raw: html,
      page: true,
    };
  }

  private authorize(ctx: RequestCtx, oauth: NonNullable<Backend['oauth']>): Reply {
    const p = this.params(ctx);
    const client = oauth.clients.find((candidate) => candidate.clientId === p.get('client_id'));
    const redirect = p.get('redirect_uri') ?? '';
    // Without a known client and an exactly registered redirect, nothing is redirected: the browser stays here.
    if (client === undefined) return this.page(400, '<h1>Unknown client</h1><p>The <code>client_id</code> is not registered.</p>');
    if (!client.redirectUris.includes(redirect)) return this.page(400, '<h1>Redirect not allowed</h1><p>The <code>redirect_uri</code> must equal one registered for this client.</p>');
    const state = p.get('state');
    const back = (values: Record<string, string>): Reply => {
      const target = new URL(redirect);
      for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
      if (state !== null) target.searchParams.set('state', state);
      return { status: 302, headers: { location: target.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, page: true };
    };
    if (p.get('response_type') !== 'code') return back({ error: 'unsupported_response_type', error_description: 'Only response_type=code.' });
    const challenge = p.get('code_challenge') ?? '';
    if (p.get('code_challenge_method') !== 'S256' || !CHALLENGE.test(challenge)) return back({ error: 'invalid_request', error_description: 'PKCE with code_challenge_method=S256 is required.' });
    const scope = p.get('scope') ?? 'openid profile email';
    if (ctx.method === 'POST') {
      if (p.get('deny') !== null) return back({ error: 'access_denied', error_description: 'The user denied the request.' });
      const user = this.deps.accounts.byId(Number(p.get('user')));
      if (user === undefined || user.disabled) return this.page(400, '<h1>Unknown user</h1>');
      if (this.codes.size >= MAX_CODES) this.sweep();
      const code = randomBytes(32).toString('base64url');
      this.codes.set(code, { clientId: client.clientId, redirectUri: redirect, userId: user.id, challenge, scope, nonce: p.get('nonce') ?? undefined, expires: this.deps.now().getTime() + CODE_TTL_MS });
      return back({ code });
    }
    const hidden = ['client_id', 'redirect_uri', 'response_type', 'state', 'scope', 'nonce', 'code_challenge', 'code_challenge_method']
      .filter((name) => p.get(name) !== null)
      .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(p.get(name) ?? '')}">`)
      .join('');
    const users = this.deps.accounts.list({ limit: 200 }).users.filter((user) => !user.disabled);
    const buttons = users.map((user) => `<button type="submit" name="user" value="${String(user.id)}">${escapeHtml(user.username)} <small>${escapeHtml(user.email ?? '')}</small></button>`).join('');
    return this.page(200, `<h1>Sign in as&hellip;</h1><p>${escapeHtml(client.name ?? client.clientId)} wants to sign in with a user of this mock backend.</p><form method="post" action="">${hidden}${buttons === '' ? '<p>There are no app users yet.</p>' : buttons}<button class="deny" type="submit" name="deny" value="1">Deny</button></form>`);
  }

  private sweep(): void {
    const now = this.deps.now().getTime();
    for (const [code, entry] of this.codes) if (entry.expires <= now) this.codes.delete(code);
    while (this.codes.size >= MAX_CODES) this.codes.delete(this.codes.keys().next().value as string);
  }

  // ---- token

  private clientAuth(ctx: RequestCtx, form: URLSearchParams, oauth: NonNullable<Backend['oauth']>): { clientId: string } | Reply {
    let clientId = form.get('client_id') ?? undefined;
    let secret = form.get('client_secret') ?? undefined;
    const basic = /^Basic\s+(\S+)$/i.exec(String(ctx.headers.authorization ?? ''));
    if (basic?.[1] !== undefined) {
      const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
      const at = decoded.indexOf(':');
      if (at > 0) {
        clientId = decodeURIComponent(decoded.slice(0, at));
        secret = decodeURIComponent(decoded.slice(at + 1));
      }
    }
    const client = oauth.clients.find((candidate) => candidate.clientId === clientId);
    if (client === undefined) return oauthError(401, 'invalid_client', 'Unknown client.', { 'www-authenticate': 'Basic' });
    const expected = this.secretOf(client.clientId);
    if (expected !== undefined) {
      const given = Buffer.from(secret ?? '');
      const want = Buffer.from(expected);
      if (given.length !== want.length || !timingSafeEqual(given, want)) return oauthError(401, 'invalid_client', 'The client secret is wrong.', { 'www-authenticate': 'Basic' });
    }
    return { clientId: client.clientId };
  }

  private formOf(ctx: RequestCtx): URLSearchParams {
    if (/json/i.test(String(ctx.headers['content-type'] ?? ''))) {
      try {
        const parsed = JSON.parse(ctx.bodyText) as Record<string, unknown>;
        return new URLSearchParams(Object.entries(parsed).flatMap(([key, value]): [string, string][] => (typeof value === 'string' ? [[key, value]] : [])));
      } catch {
        return new URLSearchParams();
      }
    }
    return new URLSearchParams(ctx.bodyText);
  }

  private token(ctx: RequestCtx, oauth: NonNullable<Backend['oauth']>, origin: string): Reply {
    const form = this.formOf(ctx);
    const client = this.clientAuth(ctx, form, oauth);
    if ('status' in client) return client;
    const grant = form.get('grant_type');
    if (grant === 'refresh_token') {
      const result = this.deps.auth.refresh(form.get('refresh_token') ?? '');
      if (!result.ok) return oauthError(400, 'invalid_grant', 'The refresh token is invalid or expired.');
      return jsonReply(200, { access_token: result.accessToken, token_type: 'Bearer', expires_in: this.deps.auth.cookieMaxAgeSec(), refresh_token: result.refreshToken }, { 'cache-control': 'no-store', pragma: 'no-cache' });
    }
    if (grant !== 'authorization_code') return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
    const value = form.get('code') ?? '';
    const code = this.codes.get(value);
    // A code works once, whatever happens next.
    this.codes.delete(value);
    if (code === undefined || code.expires <= this.deps.now().getTime()) return oauthError(400, 'invalid_grant', 'The code is unknown, used or expired.');
    if (code.clientId !== client.clientId) return oauthError(400, 'invalid_grant', 'The code was issued to another client.');
    if (form.get('redirect_uri') !== code.redirectUri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
    const verifier = form.get('code_verifier') ?? '';
    const derived = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
    const wanted = Buffer.from(code.challenge);
    if (!VERIFIER.test(verifier) || derived.length !== wanted.length || !timingSafeEqual(derived, wanted)) return oauthError(400, 'invalid_grant', 'The code_verifier does not match the code_challenge.');
    const user = this.deps.accounts.byId(code.userId);
    if (user === undefined || user.disabled) return oauthError(400, 'invalid_grant', 'The user is gone or disabled.');
    const tokens = this.deps.auth.signIn(user);
    const wantsId = code.scope.split(/\s+/).includes('openid');
    return jsonReply(
      200,
      {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: this.deps.auth.cookieMaxAgeSec(),
        refresh_token: tokens.refreshToken,
        scope: code.scope,
        ...(wantsId ? { id_token: this.idToken(user, client.clientId, code.nonce, oauth.provider, origin) } : {}),
      },
      { 'cache-control': 'no-store', pragma: 'no-cache' },
    );
  }

  private idToken(user: UserRecord, audience: string, nonce: string | undefined, provider: string, origin: string): string {
    const key = this.signingKey();
    const nowSec = Math.floor(this.deps.now().getTime() / 1000);
    const claims = { iss: this.endpoints(origin).issuer, aud: audience, iat: nowSec, exp: nowSec + this.deps.auth.cookieMaxAgeSec(), ...(nonce === undefined ? {} : { nonce }), ...claimsFor(provider, user) };
    const input = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.kid }))}.${b64(JSON.stringify(claims))}`;
    return `${input}.${b64(createSign('RSA-SHA256').update(input).sign(createPrivateKey(key.pem)))}`;
  }

  private userinfo(ctx: RequestCtx, oauth: NonNullable<Backend['oauth']>): Reply {
    const match = /^Bearer\s+(\S+)$/i.exec(String(ctx.headers.authorization ?? ''));
    const found = match?.[1] === undefined ? undefined : this.deps.auth.userFromToken(match[1]);
    const user = found === undefined ? undefined : this.deps.accounts.byId(found.id);
    if (user === undefined) return oauthError(401, 'invalid_token', 'The access token is invalid or expired.', { 'www-authenticate': 'Bearer error="invalid_token"' });
    return jsonReply(200, claimsFor(oauth.provider, user), { 'cache-control': 'no-store' });
  }
}
