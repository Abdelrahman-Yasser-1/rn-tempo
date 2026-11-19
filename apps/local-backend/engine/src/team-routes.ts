import { errorReply } from './admin.ts';
import type { ApiKeys } from './api-keys.ts';
import type { Actor } from './audit.ts';
import type { AuditLog } from './audit-log.ts';
import { ConflictError, NotListedError, type BackendRegistry } from './hub-backends.ts';
import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import { isKeyScope, isMemberRole, type Role } from './roles.ts';
import { DefinitionError } from './schema.ts';
import type { TeamAuth } from './team-auth.ts';
import { emailOk, normalizeEmail } from './team-auth.ts';
import type { AccountRow, ApiKeyRow, TeamStore } from './team-store.ts';
import type { Sessions } from './web-auth.ts';

/** The signed-in account behind a `/__hub` call. */
export interface Who {
  account: AccountRow;
  actor: Actor;
  /** The cookie id of this session (so "sign out everywhere else" can keep it). */
  sessionId: string;
  /** The account's role on the backend the route names (`:id`), when it names one. */
  role: Role | undefined;
  /** Says what the audit entry of this call is about (instead of the plain route parameters). */
  note: (target: string) => void;
}

export interface TeamRoute {
  method: string;
  pattern: string;
  streamsBody?: boolean;
  handler: (ctx: RequestCtx, params: Record<string, string>, who: Who) => Reply | Promise<Reply>;
}

export interface TeamServices {
  store: TeamStore;
  auth: TeamAuth;
  keys: ApiKeys;
  registry: BackendRegistry;
  sessions: Sessions;
  audit: AuditLog;
  now: () => number;
  /** Where the public APIs are served when they have their own origin (`--public-origin`), else `null`. */
  publicOrigin: string | null;
}

export const accountJson = (services: TeamServices, account: AccountRow): Record<string, unknown> => ({
  id: account.id,
  email: account.email,
  name: account.name,
  owner: account.owner,
  disabled: account.disabled,
  totp: account.totpSecret !== null,
  recoveryCodesLeft: services.auth.totpState(account).recoveryCodesLeft,
  invitePending: account.passwordHash === null,
  createdAt: account.createdAt,
  lastLoginAt: account.lastLoginAt,
});

const keyJson = (key: ApiKeyRow): Record<string, unknown> => ({ id: key.id, name: key.name, scope: key.scope, prefix: key.prefix, createdBy: key.createdBy, createdAt: key.createdAt, lastUsedAt: key.lastUsedAt, revokedAt: key.revokedAt });

type Body = Record<string, unknown>;
const bodyOf = (ctx: RequestCtx): Body | Reply => {
  const parsed = readJson(ctx);
  if (!parsed.ok) return parsed.reply;
  return typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value) ? (parsed.value as Body) : {};
};
const isReply = (value: Body | Reply): value is Reply => typeof value.status === 'number' && typeof value.headers === 'object';
const text = (value: unknown, max = 256): string => (typeof value === 'string' ? value.slice(0, max) : '');
const wantId = (raw: string | undefined): number | undefined => (raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined);
const no = (detail: string, status = 400): Reply => problemReply(status, { detail });

/** Errors the routes throw on purpose (`Error` with a message for the person), as problem answers. */
function failure(error: unknown): Reply {
  if (error instanceof ConflictError) return problemReply(409, { detail: error.message });
  if (error instanceof NotListedError) return problemReply(404, { detail: error.message });
  if (error instanceof DefinitionError) return errorReply(error);
  if (error instanceof Error && /^(Use a password|That is not a valid|An account with)/.test(error.message)) return problemReply(error.message.startsWith('An account') ? 409 : 400, { detail: error.message });
  return errorReply(error);
}

/** The routes under `/__hub` that the team server adds to (or replaces in) the registry's. */
export function teamRoutes(services: TeamServices): TeamRoute[] {
  const { store, auth, keys, registry, sessions, audit } = services;
  const guard =
    (run: TeamRoute['handler']): TeamRoute['handler'] =>
    async (ctx, params, who) => {
      try {
        return await run(ctx, params, who);
      } catch (error) {
        return failure(error);
      }
    };

  const backendKnown = (id: string): boolean => registry.listedIds().includes(id);
  const targetAccount = (raw: string | undefined): AccountRow | undefined => {
    const id = wantId(raw);
    return id === undefined ? undefined : store.accountById(id);
  };
  /**
   * A member of the backend that the caller may manage. The owner account is never managed here; an admin cannot touch
   * another admin (only the owner can), nor themselves (so a backend is never left without one by its own admin).
   */
  const manageable = (who: Who, backendId: string, raw: string | undefined): { account: AccountRow } | Reply => {
    const account = targetAccount(raw);
    const member = account === undefined ? undefined : store.membership(account.id, backendId);
    if (account === undefined || member === undefined) return no('That person is not a member of this backend.', 404);
    if (account.owner) return no('The server owner is managed with the CLI.', 403);
    if (who.role !== 'owner') {
      if (account.id === who.account.id) return no('Ask another admin to change your own access.', 403);
      // An admin of any backend is out of reach for other admins, whatever backend this call names: only the owner can change them.
      if (member.role === 'admin' || store.memberships(account.id).some((other) => other.role === 'admin')) return no('Only the server owner can change an admin.', 403);
    }
    return { account };
  };

  /**
   * A member route that resets credentials (a setup link, two-step sign-in). An account is the person's across the
   * whole server, so an admin may only do this for accounts that belong to backends they administer and to no other,
   * and only issue a link for an invitation that was not used yet. A password reset of an active account, or of anyone
   * who also has access elsewhere (or is the owner), goes through the owner's routes (`/team/accounts/...`).
   */
  const resettable = (who: Who, backendId: string, raw: string | undefined, action: 'reset-totp' | 'reset-link'): { account: AccountRow } | Reply => {
    const found = manageable(who, backendId, raw);
    if ('status' in found) return found;
    if (who.role === 'owner') return found;
    const administered = new Set(store.memberships(who.account.id).filter((member) => member.role === 'admin').map((member) => member.backendId));
    if (store.memberships(found.account.id).some((member) => !administered.has(member.backendId))) return no('That person also has access to backends you do not administer. Ask the server owner.', 403);
    if (action === 'reset-link' && found.account.passwordHash !== null) return no('A new link is only issued here for an invitation that was not used yet. Ask the server owner to reset a password.', 403);
    return found;
  };

  const startAfter = async (reply: Reply): Promise<Reply> => {
    const id = typeof reply.body === 'object' && reply.body !== null ? (reply.body as { path?: unknown }).path : undefined;
    if (reply.status < 300 && typeof id === 'string') {
      try {
        await registry.start(id, null);
      } catch {
        // The status shows why it did not start.
      }
      return { ...reply, body: registry.status(id) };
    }
    return reply;
  };
  const underlying = (method: string, pattern: string): TeamRoute['handler'] => {
    const route = registry.routes.find((candidate) => candidate.method === method && candidate.pattern === pattern);
    if (route === undefined) throw new Error(`The backend registry has no ${method} ${pattern}.`);
    return (ctx, params) => route.handler(ctx, params);
  };
  const openRoute = underlying('POST', '/backends/open');
  const restoreRoute = underlying('POST', '/restore');
  const createRoute = underlying('POST', '/backends');
  const removeRoute = underlying('DELETE', '/backends/:id');

  const routes: TeamRoute[] = [
    { method: 'GET', pattern: '/info', handler: () => jsonReply(200, { mode: 'team' }) },
    {
      method: 'GET',
      pattern: '/backends',
      handler: (_ctx, _params, who) => {
        const mine = new Set(store.memberships(who.account.id).map((member) => member.backendId));
        return jsonReply(200, registry.list().filter((backend) => who.account.owner || mine.has(backend.path)));
      },
    },
    {
      method: 'POST',
      pattern: '/backends',
      handler: async (ctx, params, who) => {
        const reply = await createRoute(ctx, params, who);
        if (reply.status >= 300) return reply;
        const id = (reply.body as { path: string }).path;
        who.note(id);
        await registry.start(id, null).catch(() => undefined);
        return jsonReply(201, registry.status(id));
      },
    },
    { method: 'POST', pattern: '/backends/open', handler: async (ctx, params, who) => startAfter(await openRoute(ctx, params, who)) },
    {
      method: 'POST',
      pattern: '/restore',
      streamsBody: true,
      handler: async (ctx, params, who) => startAfter(await restoreRoute(ctx, params, who)),
    },
    {
      method: 'DELETE',
      pattern: '/backends/:id',
      handler: async (ctx, params, who) => {
        const reply = await removeRoute(ctx, params, who);
        if (reply.status < 300) store.dropBackend(params.id ?? '');
        return reply;
      },
    },

    // ---- the signed-in person
    { method: 'GET', pattern: '/me', handler: (_ctx, _params, who) => jsonReply(200, { publicOrigin: services.publicOrigin, account: accountJson(services, who.account), memberships: store.memberships(who.account.id).map(({ backendId, role }) => ({ backendId, role })) }) },
    {
      method: 'POST',
      pattern: '/me/password',
      handler: guard(async (ctx, _params, who) => {
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        if (!(await auth.changePassword(who.account, text(body.currentPassword), text(body.newPassword)))) return no('The current password is wrong.', 403);
        // A changed password ends the other sessions of this account.
        sessions.destroyAccount(who.account.id, who.sessionId);
        return jsonReply(200, { ok: true });
      }),
    },
    {
      method: 'POST',
      pattern: '/me/totp/setup',
      handler: guard((_ctx, _params, who) => {
        if (who.account.totpSecret !== null) return no('Two-step sign-in is already on. Turn it off first to set it up again.', 409);
        return jsonReply(200, auth.beginTotp(who.account));
      }),
    },
    {
      method: 'POST',
      pattern: '/me/totp/enable',
      handler: guard((ctx, _params, who) => {
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        const done = auth.confirmTotp(who.account, text(body.code, 16));
        if (done === undefined) return no('That code is wrong, or the set-up expired. Start again.', 400);
        sessions.destroyAccount(who.account.id, who.sessionId);
        return jsonReply(200, done);
      }),
    },
    {
      method: 'POST',
      pattern: '/me/totp/disable',
      handler: guard(async (ctx, _params, who) => {
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        if (!(await auth.passwordMatches(who.account, text(body.password)))) return no('The password is wrong.', 403);
        store.clearTotp(who.account.id);
        return jsonReply(200, { ok: true });
      }),
    },
    {
      method: 'POST',
      pattern: '/me/recovery-codes',
      handler: guard(async (ctx, _params, who) => {
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        if (who.account.totpSecret === null) return no('Turn on two-step sign-in first.', 409);
        if (!(await auth.passwordMatches(who.account, text(body.password)))) return no('The password is wrong.', 403);
        return jsonReply(200, { recoveryCodes: auth.newRecoveryCodes(who.account.id) });
      }),
    },

    // ---- everyone on the server (owner)
    {
      method: 'GET',
      pattern: '/team/accounts',
      handler: () => jsonReply(200, store.listAccounts().map((account) => ({ ...accountJson(services, account), memberships: store.memberships(account.id).map(({ backendId, role }) => ({ backendId, role })) }))),
    },
    ...(['disable', 'enable', 'reset-totp', 'reset-link'] as const).map(
      (action): TeamRoute => ({
        method: 'POST',
        pattern: `/team/accounts/:accountId/${action}`,
        handler: guard((_ctx, params, who) => {
          const account = targetAccount(params.accountId);
          if (account === undefined) return no('No such account.', 404);
          if (account.owner && action !== 'reset-link') return no('The server owner is managed with the CLI.', 403);
          if (account.id === who.account.id && action === 'disable') return no('You cannot disable your own account.', 403);
          who.note(account.email);
          if (action === 'disable' || action === 'enable') {
            store.setDisabled(account.id, action === 'disable');
            if (action === 'disable') sessions.destroyAccount(account.id);
            return jsonReply(200, { ok: true });
          }
          if (action === 'reset-totp') {
            store.clearTotp(account.id);
            sessions.destroyAccount(account.id);
            return jsonReply(200, { ok: true });
          }
          const link = auth.issueSetupToken(account.id);
          return jsonReply(200, { setup: link });
        }),
      }),
    ),
    {
      method: 'DELETE',
      pattern: '/team/accounts/:accountId',
      handler: guard((_ctx, params, who) => {
        const account = targetAccount(params.accountId);
        if (account === undefined) return no('No such account.', 404);
        if (account.owner || account.id === who.account.id) return no('That account cannot be deleted here.', 403);
        who.note(account.email);
        sessions.destroyAccount(account.id);
        store.deleteAccount(account.id);
        return jsonReply(200, { ok: true });
      }),
    },

    // ---- members of one backend (admin)
    {
      method: 'GET',
      pattern: '/backends/:id/members',
      handler: guard((_ctx, params) => {
        const id = params.id ?? '';
        if (!backendKnown(id)) return no(`No backend "${id}".`, 404);
        const members = store.membersOf(id).flatMap((member) => {
          const account = store.accountById(member.accountId);
          return account === undefined ? [] : [{ ...accountJson(services, account), role: member.role }];
        });
        return jsonReply(200, members);
      }),
    },
    {
      method: 'POST',
      pattern: '/backends/:id/members',
      handler: guard((ctx, params, who) => {
        const id = params.id ?? '';
        if (!backendKnown(id)) return no(`No backend "${id}".`, 404);
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        const email = normalizeEmail(text(body.email, 254));
        if (!emailOk(email)) return no('That is not a valid email address.');
        if (!isMemberRole(body.role)) return no('Choose a role: admin, editor or viewer.');
        if (body.role === 'admin' && who.role !== 'owner' && who.role !== 'admin') return no('Only an admin can add an admin.', 403);
        who.note(`${email} as ${body.role}`);
        const existing = store.accountByEmail(email);
        if (existing?.owner === true) return no('The server owner already has access to every backend.', 409);
        if (existing !== undefined) {
          store.setMembership(existing.id, id, body.role);
          return jsonReply(200, { member: { ...accountJson(services, existing), role: body.role } });
        }
        const invited = auth.invite({ email, name: text(body.name, 100) });
        store.setMembership(invited.account.id, id, body.role);
        return jsonReply(201, { member: { ...accountJson(services, invited.account), role: body.role }, setup: { token: invited.token, expiresAt: invited.expiresAt } });
      }),
    },
    {
      method: 'PUT',
      pattern: '/backends/:id/members/:accountId',
      handler: guard((ctx, params, who) => {
        const id = params.id ?? '';
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        if (!isMemberRole(body.role)) return no('Choose a role: admin, editor or viewer.');
        const found = manageable(who, id, params.accountId);
        if ('status' in found) return found;
        store.setMembership(found.account.id, id, body.role);
        who.note(`${found.account.email} to ${body.role}`);
        return jsonReply(200, { ok: true, role: body.role });
      }),
    },
    {
      method: 'DELETE',
      pattern: '/backends/:id/members/:accountId',
      handler: guard((_ctx, params, who) => {
        const id = params.id ?? '';
        const found = manageable(who, id, params.accountId);
        if ('status' in found) return found;
        store.removeMembership(found.account.id, id);
        who.note(found.account.email);
        return jsonReply(200, { ok: true });
      }),
    },
    ...(['reset-totp', 'reset-link'] as const).map(
      (action): TeamRoute => ({
        method: 'POST',
        pattern: `/backends/:id/members/:accountId/${action}`,
        handler: guard((_ctx, params, who) => {
          const found = resettable(who, params.id ?? '', params.accountId, action);
          if ('status' in found) return found;
          who.note(found.account.email);
          if (action === 'reset-totp') {
            store.clearTotp(found.account.id);
            sessions.destroyAccount(found.account.id);
            return jsonReply(200, { ok: true });
          }
          return jsonReply(200, { setup: auth.issueSetupToken(found.account.id) });
        }),
      }),
    ),

    // ---- API keys (admin)
    {
      method: 'GET',
      pattern: '/backends/:id/api-keys',
      handler: guard((_ctx, params) => (backendKnown(params.id ?? '') ? jsonReply(200, store.keysOf(params.id ?? '').map(keyJson)) : no(`No backend "${params.id ?? ''}".`, 404))),
    },
    {
      method: 'POST',
      pattern: '/backends/:id/api-keys',
      handler: guard((ctx, params, who) => {
        const id = params.id ?? '';
        if (!backendKnown(id)) return no(`No backend "${id}".`, 404);
        const body = bodyOf(ctx);
        if (isReply(body)) return body;
        const name = text(body.name, 80).trim();
        if (name === '') return no('Give the key a name, for example "CI".');
        if (!isKeyScope(body.scope)) return no('Choose a scope: read-definition, sessions, admin or public.');
        const made = keys.create({ backendId: id, name, scope: body.scope, createdBy: who.actor.label });
        who.note(`${name} (${body.scope}) ${made.record.prefix}`);
        // The whole key is in this answer and nowhere else, ever.
        return jsonReply(201, { key: made.key, record: keyJson(made.record) });
      }),
    },
    {
      method: 'DELETE',
      pattern: '/backends/:id/api-keys/:keyId',
      handler: guard((_ctx, params, who) => {
        const key = store.keyById(wantId(params.keyId) ?? 0);
        if (key === undefined || key.backendId !== params.id) return no('No such key.', 404);
        keys.revoke(key.id);
        who.note(`${key.name} ${key.prefix}`);
        return jsonReply(200, { ok: true });
      }),
    },

    // ---- the audit log (admin of the backend, owner for all)
    {
      method: 'GET',
      pattern: '/backends/:id/audit',
      handler: (ctx, params) => jsonReply(200, audit.query(auditFilter(ctx, params.id ?? ''))),
    },
    { method: 'GET', pattern: '/audit', handler: (ctx) => jsonReply(200, audit.query(auditFilter(ctx, ctx.query.get('backend') ?? undefined))) },
  ];
  return routes;
}

function auditFilter(ctx: RequestCtx, backend: string | undefined): Parameters<AuditLog['query']>[0] {
  const get = (name: string): string | undefined => {
    const value = ctx.query.get(name);
    return value === null || value === '' ? undefined : value.slice(0, 120);
  };
  const number = (name: string): number | undefined => {
    const value = ctx.query.get(name);
    return value !== null && /^\d{1,6}$/.test(value) ? Number(value) : undefined;
  };
  const [actor, action, since, until, limit, skip] = [get('actor'), get('action'), get('since'), get('until'), number('limit'), number('skip')];
  return {
    ...(backend === undefined ? {} : { backend }),
    ...(actor === undefined ? {} : { actor }),
    ...(action === undefined ? {} : { action }),
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(limit === undefined ? {} : { limit }),
    ...(skip === undefined ? {} : { skip }),
  };
}
