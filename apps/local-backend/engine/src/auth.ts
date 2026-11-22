import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FieldIssue } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { publicUser, type Accounts, type AuthUser, type NewUser, type UserPatch, type UserRecord } from './accounts.ts';
import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import type { Handler } from './router.ts';
import type { AuthConfigValue, AuthEndpoint, UsersEndpoint } from './schema.ts';
import { UniqueViolationError } from './store.ts';
import { APP_CSRF_COOKIE, APP_CSRF_HEADER, APP_SESSION_COOKIE } from './constants.ts';
import { readCookie } from './web-auth.ts';
import { hashPassword, hashPasswordSync, MAX_PASSWORD_LENGTH, signAccessToken, verifyAccessToken, verifyPassword } from './tokens.ts';

/** The longest access token a client can ask for with `expiresInMins` (one day). */
export const MAX_EXPIRES_IN_MIN = 1440;
const MIN_PASSWORD_LENGTH = 6;
const DAY_MS = 86_400_000;

const noControl = (value: string): boolean => !/[\u0000-\u001f\u007f]/.test(value);
const text = (max: number): z.ZodString => z.string().max(max).refine(noControl, { message: 'Must not contain control characters.' });

const username = z.string().trim().min(1, 'Required.').max(64).refine(noControl, { message: 'Must not contain control characters.' });
const email = z.string().trim().max(254).refine((value) => value === '' || /^[^\s@]+@[^\s@]+$/.test(value), { message: 'Must be an email address.' });
const password = z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(MAX_PASSWORD_LENGTH);
const extra = z.record(z.string(), z.unknown());
const expiresInMins = z.number().int().positive().optional();

const profile = {
  firstName: text(100).optional(),
  lastName: text(100).optional(),
  gender: text(32).optional(),
  image: text(2048).optional(),
  email: email.optional(),
  extra: extra.optional(),
};

const LoginBody = z.looseObject({ username: z.string().min(1, 'Required.').max(254), password: z.string().min(1, 'Required.').max(MAX_PASSWORD_LENGTH), expiresInMins });
const RefreshBody = z.looseObject({ refreshToken: z.string().min(1, 'Required.').max(512), expiresInMins });
const LogoutBody = z.looseObject({ refreshToken: z.string().max(512).optional() });
const RegisterBody = z.looseObject({ username, password, ...profile });
export const AddUserBody = z.looseObject({ username, password: password.optional(), ...profile });
const UpdateMeBody = z.looseObject({ username: username.optional(), ...profile, currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(), password: password.optional() });
export const UserFieldsBody = z.looseObject({ username: username.optional(), ...profile });
export const PasswordBody = z.looseObject({ password });
const ForgotBody = z.looseObject({ email: z.string().min(1).max(254) });
const OtpVerifyBody = z.looseObject({ target: z.string().max(254), code: z.string().max(64), purpose: z.string().max(32).optional() });
const OtpResendBody = z.looseObject({ target: z.string().max(254), purpose: z.string().max(32).optional() });

function issuesOf(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ path: ['body', ...issue.path].join('.'), message: issue.message }));
}

const invalid = (errors: FieldIssue[]): Reply =>
  problemReply(400, { detail: `${errors[0]?.path ?? 'body'}: ${errors[0]?.message ?? 'Invalid request.'}`, errors });

export function parseBody<T extends z.ZodType>(ctx: RequestCtx, schema: T): { ok: true; value: z.infer<T> } | { ok: false; reply: Reply } {
  const body = readJson(ctx);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.value ?? {});
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reply: invalid(issuesOf(parsed.error)) };
}

export const conflict = (error: UniqueViolationError): Reply =>
  problemReply(409, { detail: error.field === 'email' ? 'That email is already in use.' : 'That username is already taken.', errors: [{ path: `body.${error.field ?? 'username'}`, message: 'Already exists.' }] });

/** Drops the keys of a parsed body that are `undefined`, so they do not count as "given". */
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export function profileOf(body: { username?: string | undefined; email?: string | undefined; firstName?: string | undefined; lastName?: string | undefined; gender?: string | undefined; image?: string | undefined; extra?: Record<string, unknown> | undefined }): UserPatch {
  return defined({ username: body.username, email: body.email, firstName: body.firstName, lastName: body.lastName, gender: body.gender, image: body.image, extra: body.extra });
}

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const NO_TOKEN = 'Invalid or expired token';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The answer for a request that is not (or no longer) signed in: 403 when the CSRF check refused a cookie session, else 401. */
export const notSignedIn = (ctx: RequestCtx): Reply =>
  ctx.csrfRefused === true
    ? problemReply(403, { title: 'Forbidden', detail: `This request was signed in by the session cookie but is not proven to come from your app. Send the ${APP_CSRF_HEADER} header (the csrfToken of the login), or an Origin that is this server or one of the cors origins.` })
    : problemReply(401, { detail: NO_TOKEN });

/** App users, tokens and the checks `auth: "bearer"` endpoints use. One per engine. */
export class AuthService {
  readonly accounts: Accounts;
  private readonly secret: Buffer;
  private readonly settings: () => AuthConfigValue;
  private readonly now: () => Date;
  private readonly corsOrigins: () => readonly string[];

  constructor(accounts: Accounts, secret: Buffer, settings: () => AuthConfigValue, now: () => Date, corsOrigins: () => readonly string[] = () => []) {
    this.corsOrigins = corsOrigins;
    this.accounts = accounts;
    this.secret = secret;
    this.settings = settings;
    this.now = now;
  }

  /**
   * Verifies the `Authorization: Bearer` token of a request and, when it is good and the user exists and is
   * not disabled, sets `ctx.user`.
   */
  authenticate(ctx: RequestCtx): boolean {
    if (ctx.user !== undefined) return true;
    const found = this.tokenOf(ctx);
    const user = found === undefined ? undefined : this.userFromToken(found.token);
    if (found === undefined || user === undefined) return false;
    // A cookie is sent by the browser on its own, so an unsafe request that rides on it must prove where it came from.
    if (found.cookie && UNSAFE.has(ctx.method.toUpperCase()) && !this.csrfOk(ctx, found.token)) {
      ctx.csrfRefused = true;
      return false;
    }
    // A WebSocket or event stream is a GET and has no CSRF header, but the browser sends an Origin on a WebSocket and a
    // cross-origin stream: it must be this server or a cors origin. Bearer-authenticated connections are not affected.
    if (found.cookie && ctx.live === true && !this.streamOriginOk(ctx)) {
      ctx.csrfRefused = true;
      return false;
    }
    if (found.cookie) ctx.viaCookie = true;
    ctx.user = user;
    return true;
  }

  /** The double-submit token of a session: a keyed hash of the access token, so nothing is stored. */
  csrfTokenFor(accessToken: string): string {
    return createHmac('sha256', this.secret).update(`csrf:${accessToken}`).digest('base64url');
  }

  private csrfOk(ctx: RequestCtx, accessToken: string): boolean {
    const header = ctx.headers[APP_CSRF_HEADER];
    const given = Buffer.from(typeof header === 'string' ? header : '');
    const want = Buffer.from(this.csrfTokenFor(accessToken));
    if (given.length === want.length && timingSafeEqual(given, want)) return true;
    const origin = typeof ctx.headers.origin === 'string' ? ctx.headers.origin : undefined;
    // Native clients send no Origin and must use the header. A browser always sends one on an unsafe request.
    if (origin === undefined) return false;
    const allowed = origin === ctx.origin || this.corsOrigins().includes(origin);
    if (ctx.headers['sec-fetch-site'] === 'cross-site' && !this.corsOrigins().includes(origin)) return false;
    return allowed;
  }

  /** The Origin of a cookie-authenticated stream: this server, or a cors origin; no Origin only when the browser says `same-origin`. */
  private streamOriginOk(ctx: RequestCtx): boolean {
    const origin = typeof ctx.headers.origin === 'string' ? ctx.headers.origin : undefined;
    if (origin === undefined) return ctx.headers['sec-fetch-site'] === 'same-origin';
    if (this.corsOrigins().includes(origin)) return true;
    return origin === ctx.origin && ctx.headers['sec-fetch-site'] !== 'cross-site';
  }

  /** The user an access token belongs to, when it is good (any auth mode). */
  userFromToken(token: string): AuthUser | undefined {
    const verified = verifyAccessToken(this.secret, token, this.now().getTime());
    if (!verified.ok) return undefined;
    const id = Number(verified.claims.sub);
    const user = Number.isInteger(id) ? this.accounts.byId(id) : undefined;
    if (user === undefined || user.disabled || user.tokenVersion !== verified.claims.ver) return undefined;
    return { id: user.id, username: user.username } satisfies AuthUser;
  }

  /** `bearer`, `cookie` or `both`: where a request may carry its access token. */
  get mode(): AuthConfigValue['mode'] {
    return this.settings().mode;
  }

  /** The access token of a request: the `Authorization` header (modes bearer and both), else the session cookie (cookie and both). */
  private tokenOf(ctx: RequestCtx): { token: string; cookie: boolean } | undefined {
    const mode = this.mode;
    if (mode !== 'cookie') {
      const match = /^Bearer\s+(\S+)$/i.exec(String(ctx.headers.authorization ?? ''));
      if (match?.[1] !== undefined) return { token: match[1], cookie: false };
    }
    if (mode === 'bearer') return undefined;
    const cookie = readCookie(typeof ctx.headers.cookie === 'string' ? ctx.headers.cookie : undefined, APP_SESSION_COOKIE);
    return cookie === undefined || cookie === '' ? undefined : { token: cookie, cookie: true };
  }

  /** How long the session cookie lives: the access token's lifetime. */
  cookieMaxAgeSec(): number {
    return Math.min(this.settings().accessTtlMin, this.settings().maxAccessTtlMin, MAX_EXPIRES_IN_MIN) * 60;
  }

  /** Seeds `auth.seedUsers`. Passwords are hashed here, so `backend.json` can hold a demo password. */
  seed(users: AuthConfigValue['seedUsers'], alreadySeeded: ReadonlySet<string>): string[] {
    const created: string[] = [];
    for (const seeded of users) {
      if (alreadySeeded.has(seeded.username.toLowerCase())) continue;
      const input: NewUser = {
        username: seeded.username,
        passwordHash: hashPasswordSync(seeded.password),
        ...defined({ email: seeded.email?.toLowerCase(), firstName: seeded.firstName, lastName: seeded.lastName, gender: seeded.gender, image: seeded.image, extra: seeded.extra }),
      };
      this.accounts.seed(input);
      created.push(seeded.username.toLowerCase());
    }
    return created;
  }

  /** A short-lived access token for the admin "Log in as…" picker. No refresh token, so no session is created. */
  accessTokenFor(user: UserRecord): { accessToken: string; expiresInMins: number } {
    return { accessToken: this.accessFor(user, undefined), expiresInMins: Math.min(this.settings().accessTtlMin, this.settings().maxAccessTtlMin, MAX_EXPIRES_IN_MIN) };
  }

  private accessFor(user: UserRecord, requestedMinutes: number | undefined): string {
    const settings = this.settings();
    const minutes = Math.min(requestedMinutes ?? settings.accessTtlMin, settings.maxAccessTtlMin, MAX_EXPIRES_IN_MIN);
    return signAccessToken(this.secret, String(user.id), minutes * 60, this.now().getTime(), user.tokenVersion);
  }

  private refreshTtlMs(): number {
    return this.settings().refreshTtlDays * DAY_MS;
  }

  /** A new sign-in: an access token and a refresh token that starts a new family. */
  signIn(user: UserRecord, requestedMinutes?: number): { accessToken: string; refreshToken: string } {
    return { accessToken: this.accessFor(user, requestedMinutes), refreshToken: this.accounts.issueRefresh(user.id, this.refreshTtlMs()) };
  }

  async login(login: string, passwordText: string, requestedMinutes?: number): Promise<{ ok: true; user: UserRecord; accessToken: string; refreshToken: string } | { ok: false; reply: Reply }> {
    const user = this.accounts.byLogin(login);
    const good = await verifyPassword(passwordText, user?.passwordHash ?? null);
    if (user === undefined || !good) return { ok: false, reply: problemReply(400, { detail: 'Invalid credentials' }) };
    if (user.disabled) return { ok: false, reply: problemReply(403, { detail: 'This account is disabled.' }) };
    return { ok: true, user, ...this.signIn(user, requestedMinutes) };
  }

  refresh(token: string, requestedMinutes?: number): { ok: true; accessToken: string; refreshToken: string } | { ok: false; reply: Reply } {
    const result = this.accounts.rotate(token, this.refreshTtlMs());
    if (!result.ok) {
      return { ok: false, reply: problemReply(result.reason === 'disabled' ? 403 : 401, { detail: result.reason === 'disabled' ? 'This account is disabled.' : 'Invalid refresh token' }) };
    }
    return { ok: true, accessToken: this.accessFor(result.user, requestedMinutes), refreshToken: result.refreshToken };
  }

  otpCode(): string {
    return this.settings().otpCode;
  }

  otpResendSec(): number {
    return this.settings().otpResendSec;
  }
}

/** Builds the handler of one `auth` endpoint. */
export interface CookieSettings {
  /** The `Path` of the session cookie: `/b/<id>/` on the team server, else the base path (or `/`). */
  path: () => string;
}

const sessionCookie = (token: string, path: string, maxAge: number, secure: boolean): string =>
  `${APP_SESSION_COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${secure ? '; Secure' : ''}`;
/** The CSRF cookie is readable by scripts (no HttpOnly): that is how a page echoes it in a header. Same path and lifetime as the session. */
const csrfCookie = (token: string, path: string, maxAge: number, secure: boolean): string =>
  `${APP_CSRF_COOKIE}=${token}; Path=${path}; SameSite=Lax; Max-Age=${String(maxAge)}${secure ? '; Secure' : ''}`;

export function authHandler(endpoint: AuthEndpoint, service: AuthService, cookies: CookieSettings = { path: () => '/' }): Handler {
  const unauthorized = (ctx?: RequestCtx): Reply => (ctx === undefined ? problemReply(401, { detail: NO_TOKEN }) : notSignedIn(ctx));
  /** The signed-in user, or the reply to send. */
  const signedIn = (ctx: RequestCtx): { user: UserRecord } | { reply: Reply } => {
    if (!service.authenticate(ctx) || ctx.user === undefined) return { reply: unauthorized(ctx) };
    const user = service.accounts.byId(ctx.user.id);
    return user === undefined ? { reply: unauthorized() } : { user };
  };

  return async (ctx) => {
    try {
      switch (endpoint.action) {
        case 'login': {
          const body = parseBody(ctx, LoginBody);
          if (!body.ok) return body.reply;
          const result = await service.login(body.value.username, body.value.password, body.value.expiresInMins);
          if (!result.ok) return result.reply;
          const mode = service.mode;
          if (mode === 'bearer') return jsonReply(200, { ...publicUser(result.user), accessToken: result.accessToken, refreshToken: result.refreshToken });
          // The cookie holds the access token; in `cookie` mode scripts never see a token at all.
          const secure = ctx.origin?.startsWith('https:') === true;
          const csrf = service.csrfTokenFor(result.accessToken);
          const cookie = sessionCookie(result.accessToken, cookies.path(), service.cookieMaxAgeSec(), secure);
          return { ...jsonReply(200, { ...(mode === 'cookie' ? publicUser(result.user) : { ...publicUser(result.user), accessToken: result.accessToken, refreshToken: result.refreshToken }), csrfToken: csrf }), cookies: [cookie, csrfCookie(csrf, cookies.path(), service.cookieMaxAgeSec(), secure)] };
        }
        case 'refresh': {
          const body = parseBody(ctx, RefreshBody);
          if (!body.ok) return body.reply;
          const result = service.refresh(body.value.refreshToken, body.value.expiresInMins);
          return result.ok ? jsonReply(200, { accessToken: result.accessToken, refreshToken: result.refreshToken }) : result.reply;
        }
        case 'me': {
          const who = signedIn(ctx);
          return 'reply' in who ? who.reply : jsonReply(200, publicUser(who.user));
        }
        case 'logout': {
          const who = signedIn(ctx);
          if ('reply' in who) return who.reply;
          const body = parseBody(ctx, LogoutBody);
          if (!body.ok) return body.reply;
          const owner = body.value.refreshToken === undefined ? undefined : service.accounts.tokenOwner(body.value.refreshToken);
          // A refresh token of this user signs out that one session; none given signs out everywhere.
          if (owner !== undefined && owner.userId === who.user.id) service.accounts.revokeFamily(owner.family);
          else service.accounts.revokeUser(who.user.id);
          if (service.mode === 'bearer') return jsonReply(200, { success: true });
          const secure = ctx.origin?.startsWith('https:') === true;
          return { ...jsonReply(200, { success: true }), cookies: [sessionCookie('', cookies.path(), 0, secure), csrfCookie('', cookies.path(), 0, secure)] };
        }
        case 'register': {
          const body = parseBody(ctx, RegisterBody);
          if (!body.ok) return body.reply;
          const user = service.accounts.create({ ...profileOf(body.value), username: body.value.username, passwordHash: await hashPassword(body.value.password), ...(body.value.email === undefined ? {} : { email: body.value.email.toLowerCase() }) });
          return jsonReply(201, publicUser(user));
        }
        case 'updateMe': {
          const who = signedIn(ctx);
          if ('reply' in who) return who.reply;
          const body = parseBody(ctx, UpdateMeBody);
          if (!body.ok) return body.reply;
          if (body.value.password !== undefined && who.user.passwordHash !== null && !(await verifyPassword(body.value.currentPassword ?? '', who.user.passwordHash))) {
            return invalid([{ path: 'body.currentPassword', message: 'The current password is wrong.' }]);
          }
          const patch = profileOf(body.value);
          if (typeof patch.email === 'string') patch.email = patch.email.toLowerCase();
          const updated = service.accounts.update(who.user.id, patch);
          if (updated === undefined) return unauthorized();
          if (body.value.password === undefined) return jsonReply(200, publicUser(updated));
          // A new password signs every other session out (refresh tokens and access tokens); the caller gets a fresh pair.
          service.accounts.setPasswordHash(updated.id, await hashPassword(body.value.password));
          service.accounts.revokeUser(updated.id);
          const fresh = service.accounts.byId(updated.id) ?? updated;
          return jsonReply(200, { ...publicUser(fresh), ...service.signIn(fresh) });
        }
        case 'forgotPassword': {
          const body = parseBody(ctx, ForgotBody);
          // Like the mock: the same answer whether or not the email belongs to a user.
          return body.ok ? jsonReply(200, { success: true }) : body.reply;
        }
        case 'otpVerify': {
          const body = parseBody(ctx, OtpVerifyBody);
          return body.ok ? jsonReply(200, { success: sameText(body.value.code, service.otpCode()) }) : body.reply;
        }
        case 'otpResend': {
          const body = parseBody(ctx, OtpResendBody);
          return body.ok ? jsonReply(200, { success: true, retryAfterSec: service.otpResendSec() }) : body.reply;
        }
      }
    } catch (error) {
      if (error instanceof UniqueViolationError) return conflict(error);
      throw error;
    }
  };
}

/** Builds the handler of one `users` endpoint (C13 `POST /users/add`, `PUT /users/:id`, `GET /users/:id`). */
export function usersHandler(endpoint: UsersEndpoint, service: AuthService): Handler {
  const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);
  const notFound = (raw: string | undefined): Reply => problemReply(404, { detail: `User with id '${raw ?? ''}' not found` });
  return async (ctx, params) => {
    try {
      switch (endpoint.action) {
        case 'add': {
          const body = parseBody(ctx, AddUserBody);
          if (!body.ok) return body.reply;
          const passwordHash = body.value.password === undefined ? null : await hashPassword(body.value.password);
          const user = service.accounts.create({ ...profileOf(body.value), username: body.value.username, passwordHash, ...(body.value.email === undefined ? {} : { email: body.value.email.toLowerCase() }) });
          return jsonReply(201, publicUser(user));
        }
        case 'get': {
          // Fail closed: a profile holds an email, so only its owner reads it (the schema also demands bearer).
          if (!service.authenticate(ctx) || ctx.user === undefined) return notSignedIn(ctx);
          const id = wantId(params.id);
          if (id !== undefined && ctx.user.id !== id) return problemReply(403, { detail: 'You can only read your own profile.' });
          const user = id === undefined ? undefined : service.accounts.byId(id);
          return user === undefined ? notFound(params.id) : jsonReply(200, publicUser(user));
        }
        case 'update': {
          // Fail closed: the caller must present a valid token, whatever the endpoint's `auth` says, and be the user.
          if (!service.authenticate(ctx) || ctx.user === undefined) return notSignedIn(ctx);
          const id = wantId(params.id);
          if (id !== undefined && ctx.user.id !== id) return problemReply(403, { detail: 'You can only change your own profile.' });
          if (id === undefined || service.accounts.byId(id) === undefined) return notFound(params.id);
          const body = parseBody(ctx, UserFieldsBody);
          if (!body.ok) return body.reply;
          const patch = profileOf(body.value);
          if (typeof patch.email === 'string') patch.email = patch.email.toLowerCase();
          const user = service.accounts.update(id, patch);
          return user === undefined ? notFound(params.id) : jsonReply(200, publicUser(user));
        }
      }
    } catch (error) {
      if (error instanceof UniqueViolationError) return conflict(error);
      throw error;
    }
  };
}
