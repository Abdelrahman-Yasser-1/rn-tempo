import { adminUser } from './accounts.ts';
import type { AdminRoute } from './admin.ts';
import { AddUserBody, conflict, parseBody, PasswordBody, profileOf, UserFieldsBody } from './auth.ts';
import type { Engine } from './engine.ts';
import { jsonReply, problemReply } from './http.ts';
import { UniqueViolationError } from './store.ts';
import { hashPassword } from './tokens.ts';

const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);
const number = (raw: string | null, fallback: number, max: number): number => (raw !== null && /^\d{1,9}$/.test(raw) ? Math.min(Number(raw), max) : fallback);

/**
 * Admin routes for app users and their sessions. Nothing here returns a password hash or a token hash:
 * users go through `adminUser`, sessions through `Accounts.sessions`.
 */
export function adminAuthRoutes(engine: Engine): AdminRoute[] {
  const accounts = engine.auth.accounts;
  const missing = (raw: string | undefined): ReturnType<typeof problemReply> => problemReply(404, { detail: `No user ${raw ?? ''}.` });
  /** Wraps a handler so a duplicate username or email is a 409. */
  const guarded = <A extends unknown[]>(run: (...args: A) => unknown): ((...args: A) => Promise<unknown>) => async (...args) => {
    try {
      return await run(...args);
    } catch (error) {
      if (error instanceof UniqueViolationError) return conflict(error);
      throw error;
    }
  };

  const edit: AdminRoute['handler'] = guarded((ctx, params) => {
    const id = wantId(params.id);
    if (id === undefined || accounts.byId(id) === undefined) return missing(params.id);
    const body = parseBody(ctx, UserFieldsBody);
    if (!body.ok) return body.reply;
    const patch = profileOf(body.value);
    if (typeof patch.email === 'string') patch.email = patch.email.toLowerCase();
    const user = accounts.update(id, patch);
    return user === undefined ? missing(params.id) : jsonReply(200, adminUser(user));
  }) as AdminRoute['handler'];

  return [
    {
      method: 'GET',
      pattern: '/users',
      handler: (ctx) => {
        const skip = number(ctx.query.get('skip'), 0, 1_000_000);
        const limit = Math.max(number(ctx.query.get('limit'), 50, 500), 1);
        const q = ctx.query.get('q') ?? undefined;
        const found = accounts.list({ skip, limit, ...(q === undefined ? {} : { q }) });
        return jsonReply(200, { users: found.users.map(adminUser), total: found.total, skip, limit });
      },
    },
    {
      method: 'POST',
      pattern: '/users',
      handler: guarded(async (ctx) => {
        const body = parseBody(ctx, AddUserBody);
        if (!body.ok) return body.reply;
        const passwordHash = body.value.password === undefined ? null : await hashPassword(body.value.password);
        const user = accounts.create({ ...profileOf(body.value), username: body.value.username, passwordHash, ...(body.value.email === undefined ? {} : { email: body.value.email.toLowerCase() }) });
        return jsonReply(201, adminUser(user));
      }) as AdminRoute['handler'],
    },
    {
      method: 'GET',
      pattern: '/users/:id',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        const user = id === undefined ? undefined : accounts.byId(id);
        return user === undefined ? missing(params.id) : jsonReply(200, adminUser(user));
      },
    },
    { method: 'PUT', pattern: '/users/:id', handler: edit },
    { method: 'PATCH', pattern: '/users/:id', handler: edit },
    {
      method: 'DELETE',
      pattern: '/users/:id',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        const user = id === undefined ? undefined : accounts.byId(id);
        if (id === undefined || user === undefined) return missing(params.id);
        accounts.revokeUser(id);
        accounts.remove(id);
        return jsonReply(200, adminUser(user));
      },
    },
    {
      method: 'POST',
      pattern: '/users/:id/password',
      handler: async (ctx, params) => {
        const id = wantId(params.id);
        if (id === undefined || accounts.byId(id) === undefined) return missing(params.id);
        const body = parseBody(ctx, PasswordBody);
        if (!body.ok) return body.reply;
        accounts.setPasswordHash(id, await hashPassword(body.value.password));
        // A reset password signs the user out everywhere.
        return jsonReply(200, { ok: true, revoked: accounts.revokeUser(id) });
      },
    },
    ...(['disable', 'enable'] as const).map(
      (action): AdminRoute => ({
        method: 'POST',
        pattern: `/users/:id/${action}`,
        handler: (_ctx, params) => {
          const id = wantId(params.id);
          if (id === undefined || !accounts.setDisabled(id, action === 'disable')) return missing(params.id);
          const revoked = action === 'disable' ? accounts.revokeUser(id) : 0;
          return jsonReply(200, { ok: true, disabled: action === 'disable', revoked });
        },
      }),
    ),
    {
      method: 'POST',
      pattern: '/users/:id/revoke',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        if (id === undefined || accounts.byId(id) === undefined) return missing(params.id);
        return jsonReply(200, { ok: true, revoked: accounts.revokeUser(id) });
      },
    },
    {
      method: 'POST',
      pattern: '/users/:id/token',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        const user = id === undefined ? undefined : accounts.byId(id);
        if (user === undefined) return missing(params.id);
        if (user.disabled) return problemReply(403, { detail: 'This user is disabled.' });
        return jsonReply(200, engine.auth.accessTokenFor(user));
      },
    },
    {
      method: 'GET',
      pattern: '/sessions',
      handler: (ctx) => {
        const userId = wantId(ctx.query.get('userId') ?? undefined);
        return jsonReply(200, { sessions: accounts.sessions(userId) });
      },
    },
    {
      method: 'DELETE',
      pattern: '/sessions/:id',
      handler: (_ctx, params) => {
        const id = wantId(params.id);
        return id !== undefined && accounts.revokeSession(id) ? jsonReply(200, { ok: true }) : problemReply(404, { detail: `No active session ${params.id ?? ''}.` });
      },
    },
  ];
}
