import type { Actor } from './audit.ts';

/** Per backend. `owner` is the server owner and is never stored in a membership: it is a flag on the account. */
export const ROLES = ['viewer', 'editor', 'admin'] as const;
export type MemberRole = (typeof ROLES)[number];
export type Role = MemberRole | 'owner';

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const atLeast = (have: Role, need: Role): boolean => RANK[have] >= RANK[need];
export const isMemberRole = (value: unknown): value is MemberRole => typeof value === 'string' && (ROLES as readonly string[]).includes(value);

export const API_KEY_SCOPES = ['read-definition', 'sessions', 'admin', 'public'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
export const isKeyScope = (value: unknown): value is ApiKeyScope => typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value);

/**
 * The role each route of a backend's admin API needs: `METHOD /pattern` as the engine registers it. This is the
 * whole policy, and it is deny by default: a route that is missing here is open to the owner only. A test lists the
 * routes of a running backend and fails on any route without an entry (and on any entry without a route).
 *
 * - viewer: reads, including logs and "Try it".
 * - editor: imports API files (preview and apply), changes endpoints (including their own delays and wrapper), collections, data, scenarios, media, content and the backend's app users.
 * - admin: also the snapshot export (a backup) and the backend-wide settings (public access, delays and network presets, the response wrapper, error format and templates). Members, API keys, settings and certificates are hub routes (below).
 */
export const ADMIN_ROLE_TABLE: Readonly<Record<string, Role>> = {
  'GET /events': 'viewer',
  'GET /info': 'viewer',
  'GET /definition': 'viewer',
  'PUT /definition': 'editor',
  'POST /reload': 'editor',
  'GET /endpoints': 'viewer',
  'POST /endpoints': 'editor',
  'GET /endpoints/:id': 'viewer',
  'PUT /endpoints/:id': 'editor',
  'DELETE /endpoints/:id': 'editor',
  'GET /collections': 'viewer',
  'POST /collections': 'editor',
  'GET /collections/:name': 'viewer',
  'DELETE /collections/:name': 'editor',
  'POST /collections/:name/rename': 'editor',
  'POST /collections/:name/fields': 'editor',
  'PUT /collections/:name/fields/:field': 'editor',
  'DELETE /collections/:name/fields/:field': 'editor',
  'POST /collections/:name/fields/:field/rename': 'editor',
  'GET /data/:collection': 'viewer',
  'GET /data/:collection/:id': 'viewer',
  'POST /data/:collection': 'editor',
  'PUT /data/:collection/:id': 'editor',
  'PATCH /data/:collection/:id': 'editor',
  'DELETE /data/:collection/:id': 'editor',
  'GET /scenarios': 'viewer',
  'PUT /scenarios/:endpointId': 'editor',
  'DELETE /scenarios/:endpointId': 'editor',
  'DELETE /scenarios': 'editor',
  'GET /requests': 'viewer',
  'GET /users': 'viewer',
  'POST /users': 'editor',
  'GET /users/:id': 'viewer',
  'PUT /users/:id': 'editor',
  'PATCH /users/:id': 'editor',
  'DELETE /users/:id': 'editor',
  'POST /users/:id/password': 'editor',
  'POST /users/:id/disable': 'editor',
  'POST /users/:id/enable': 'editor',
  'POST /users/:id/revoke': 'editor',
  'POST /users/:id/token': 'editor',
  'GET /sessions': 'viewer',
  'DELETE /sessions/:id': 'editor',
  'GET /media/usage': 'viewer',
  'GET /media': 'viewer',
  'POST /media': 'editor',
  'GET /media/:id': 'viewer',
  'GET /media/:id/file': 'viewer',
  'DELETE /media/:id': 'editor',
  'GET /content/config': 'viewer',
  'GET /content/types': 'viewer',
  'POST /content/types': 'editor',
  'GET /content/types/:name': 'viewer',
  'PUT /content/types/:name': 'editor',
  'DELETE /content/types/:name': 'editor',
  'POST /content/types/:name/fields': 'editor',
  'DELETE /content/types/:name/fields/:field': 'editor',
  'POST /content/types/:name/fields/:field/rename': 'editor',
  'GET /content/entries': 'viewer',
  'POST /content/entries': 'editor',
  'GET /content/entries/:id': 'viewer',
  'PUT /content/entries/:id': 'editor',
  'DELETE /content/entries/:id': 'editor',
  'POST /content/entries/:id/publish': 'editor',
  'POST /content/entries/:id/unpublish': 'editor',
  'POST /content/entries/:id/schedule': 'editor',
  'GET /content/entries/:id/versions': 'viewer',
  'GET /content/entries/:id/versions/:version': 'viewer',
  'POST /content/entries/:id/revert': 'editor',
  'GET /settings/network': 'viewer',
  'PUT /settings/network': 'admin',
  'GET /settings/responses': 'viewer',
  'PUT /settings/responses': 'admin',
  'POST /graphql/generate': 'viewer',
  'GET /realtime/:endpointId/clients': 'viewer',
  'GET /realtime/:endpointId/messages': 'viewer',
  'POST /realtime/:endpointId/send': 'editor',
  'DELETE /realtime/:endpointId/clients/:clientId': 'editor',
  'GET /webhooks': 'viewer',
  'POST /webhooks': 'editor',
  'GET /webhooks/:id': 'viewer',
  'PUT /webhooks/:id': 'editor',
  'DELETE /webhooks/:id': 'editor',
  'POST /webhooks/:id/rotate-secret': 'admin',
  'POST /webhooks/:id/test': 'editor',
  'GET /webhook-deliveries': 'viewer',
  'GET /webhook-deliveries/:id': 'viewer',
  'POST /webhook-deliveries/:id/redeliver': 'editor',
  'GET /inbox': 'viewer',
  'GET /inbox/:id': 'editor',
  'POST /inbox/:id/replay': 'editor',
  'DELETE /inbox': 'editor',
  'GET /stats': 'viewer',
  'POST /contract-check': 'viewer',
  'GET /snapshot': 'admin',
  'GET /test-snapshot': 'admin',
  'GET /openapi': 'viewer',
  'POST /import/preview': 'editor',
  'POST /import/apply': 'editor',
};

/**
 * What a `read-definition` key may call: the definition and the test snapshot, read only (the test kit). Not the backup
 * (`GET /snapshot`): that holds the whole database, app users' password hashes included.
 */
export const READ_DEFINITION_ROUTES: ReadonlySet<string> = new Set(['GET /definition', 'GET /test-snapshot']);

/** Fields of `backend.json` that are settings, not content: changing them takes an admin. */
const SETTINGS_FIELDS = ['publicAccess', 'port', 'https', 'certsDir', 'latency', 'network', 'testMode', 'responses', 'responseTemplates'] as const;
const SETTINGS_DEFAULTS: Record<(typeof SETTINGS_FIELDS)[number], unknown> = {
  publicAccess: 'open',
  port: 8443,
  https: true,
  certsDir: undefined,
  latency: undefined,
  network: undefined,
  testMode: false,
  responses: undefined,
  responseTemplates: {},
};

/** True when a new definition changes a setting (access, port, certificates, delays) compared with the current one. */
export function settingsChanged(current: unknown, next: unknown): boolean {
  const read = (value: unknown, field: (typeof SETTINGS_FIELDS)[number]): string => {
    const found = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[field] : undefined;
    return JSON.stringify(found === undefined ? SETTINGS_DEFAULTS[field] : found) ?? '';
  };
  return SETTINGS_FIELDS.some((field) => read(current, field) !== read(next, field));
}

/** Who is calling a backend's admin API in the team server, for the role check and the audit. */
export interface AdminAccess {
  actor: Actor;
  /** The caller's role on this backend. An API key counts as `admin` when its scope is `admin`. */
  role: Role;
  /** Set when the caller is an API key; only this scope's routes work. */
  keyScope?: ApiKeyScope;
  /** Called once per request that is not a GET, after the answer is known (also for a refusal). */
  onWrite?: (event: AdminWriteEvent) => void;
}

export interface AdminWriteEvent {
  /** `METHOD /pattern`. */
  route: string;
  params: Record<string, string>;
  status: number;
  /** The request body (parsed JSON), before redaction. */
  body: unknown;
  /** What the same item looked like before (from its GET route), before redaction. */
  before: unknown;
  denied: boolean;
  /** Bytes of an upload, which streams and is never read here. */
  uploadBytes: number | undefined;
}

export type Decision = { ok: true } | { ok: false; detail: string };

/** The decision for one call. `route` is `METHOD /pattern`. */
export function decide(access: AdminAccess, route: string): Decision {
  if (access.keyScope !== undefined) {
    if (access.keyScope === 'read-definition') return READ_DEFINITION_ROUTES.has(route) ? { ok: true } : { ok: false, detail: 'This API key may only read the definition and the snapshot.' };
    if (access.keyScope !== 'admin') return { ok: false, detail: `An API key with the "${access.keyScope}" scope cannot call the admin API.` };
  }
  const need = ADMIN_ROLE_TABLE[route] ?? 'owner';
  return atLeast(access.role, need) ? { ok: true } : { ok: false, detail: `That needs the ${need} role on this backend.` };
}

/**
 * Who may call each server (`/__hub`) route. `any` is every signed-in account (it only ever touches the caller's own
 * data, or is filtered to what the caller may see). `owner` is the server owner. A role names the least role needed on
 * the backend the route's `:id` points at (the owner always passes). Deny by default again: a missing entry is owner only.
 */
export type HubNeed = 'any' | 'owner' | MemberRole;
export const HUB_ROLE_TABLE: Readonly<Record<string, HubNeed>> = {
  'GET /info': 'any',
  'GET /backends': 'any',
  'GET /unlisted': 'owner',
  'POST /backends': 'owner',
  'POST /backends/open': 'owner',
  'DELETE /backends/:id': 'admin',
  'POST /backends/:id/start': 'admin',
  'POST /backends/:id/stop': 'admin',
  'GET /backends/:id/cert-info': 'viewer',
  'POST /backends/:id/certs': 'admin',
  'POST /backends/:id/handlers': 'editor',
  'GET /backends/:id/engine-log': 'viewer',
  'POST /backends/:id/try': 'viewer',
  'POST /restore': 'owner',
  'GET /me': 'any',
  'POST /me/password': 'any',
  'POST /me/totp/setup': 'any',
  'POST /me/totp/enable': 'any',
  'POST /me/totp/disable': 'any',
  'POST /me/recovery-codes': 'any',
  'GET /team/accounts': 'owner',
  'DELETE /team/accounts/:accountId': 'owner',
  'POST /team/accounts/:accountId/disable': 'owner',
  'POST /team/accounts/:accountId/enable': 'owner',
  'POST /team/accounts/:accountId/reset-totp': 'owner',
  'POST /team/accounts/:accountId/reset-link': 'owner',
  'GET /backends/:id/members': 'admin',
  'POST /backends/:id/members': 'admin',
  'PUT /backends/:id/members/:accountId': 'admin',
  'DELETE /backends/:id/members/:accountId': 'admin',
  'POST /backends/:id/members/:accountId/reset-totp': 'admin',
  'POST /backends/:id/members/:accountId/reset-link': 'admin',
  'GET /backends/:id/api-keys': 'admin',
  'POST /backends/:id/api-keys': 'admin',
  'DELETE /backends/:id/api-keys/:keyId': 'admin',
  'GET /backends/:id/audit': 'admin',
  'GET /audit': 'owner',
};
