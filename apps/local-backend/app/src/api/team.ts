// The team server's account, key and audit routes (`/__hub/...`), as the dashboard uses them. Only the web transport
// talking to `tempo-local-backend server` has these; the desktop app and the local web mode have none.

export type MemberRole = 'viewer' | 'editor' | 'admin';
/** `owner` is the server owner: every backend, plus the server's accounts. */
export type Role = MemberRole | 'owner';

export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const atLeast = (have: Role, need: Role): boolean => ROLE_RANK[have] >= ROLE_RANK[need];

export interface TeamAccount {
  id: number;
  email: string;
  name: string;
  owner: boolean;
  disabled: boolean;
  totp: boolean;
  recoveryCodesLeft: number;
  /** Invited, and has not chosen a password yet. */
  invitePending: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Member extends TeamAccount {
  role: MemberRole;
}

export interface Me {
  /** The separate origin of the public APIs (`--public-origin`), or `null` when they share the dashboard's. */
  publicOrigin: string | null;
  account: TeamAccount;
  memberships: { backendId: string; role: MemberRole }[];
}

/** A one-time link token. The page builds the link from it; it is shown once. */
export interface SetupLink {
  token: string;
  expiresAt: string;
}

export type KeyScope = 'read-definition' | 'sessions' | 'admin' | 'public';
export const KEY_SCOPES: readonly KeyScope[] = ['read-definition', 'sessions', 'admin', 'public'];

export interface ApiKeyInfo {
  id: number;
  name: string;
  scope: KeyScope;
  /** The start of the key, to recognise it in a list. */
  prefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: { kind: 'account' | 'key' | 'system'; id: string; label: string };
  backend: string | null;
  action: string;
  target: string;
  status: number;
  denied: boolean;
  summary: { before?: unknown; after?: unknown } | null;
}

export interface AuditFilter {
  actor?: string;
  action?: string;
  since?: string;
  until?: string;
  limit?: number;
  skip?: number;
}

export interface TeamApi {
  me: () => Promise<Me>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** A new TOTP secret and the `otpauth://` address for the QR code. */
  totpSetup: () => Promise<{ secret: string; uri: string }>;
  /** Confirms the setup with a code from the app. Returns the recovery codes, shown once. */
  totpEnable: (code: string) => Promise<string[]>;
  totpDisable: (password: string) => Promise<void>;
  newRecoveryCodes: (password: string) => Promise<string[]>;
  members: (backend: string) => Promise<Member[]>;
  invite: (
    backend: string,
    input: { email: string; name: string; role: MemberRole },
  ) => Promise<{ member: Member; setup: SetupLink | null }>;
  setRole: (backend: string, accountId: number, role: MemberRole) => Promise<void>;
  removeMember: (backend: string, accountId: number) => Promise<void>;
  resetTotp: (backend: string, accountId: number) => Promise<void>;
  resetLink: (backend: string, accountId: number) => Promise<SetupLink>;
  /** Owner only: every account of the server. */
  accounts: () => Promise<
    (TeamAccount & { memberships: { backendId: string; role: MemberRole }[] })[]
  >;
  setDisabled: (accountId: number, disabled: boolean) => Promise<void>;
  apiKeys: (backend: string) => Promise<ApiKeyInfo[]>;
  /** The whole key is in the answer, once. */
  createApiKey: (
    backend: string,
    input: { name: string; scope: KeyScope },
  ) => Promise<{ key: string; record: ApiKeyInfo }>;
  revokeApiKey: (backend: string, id: number) => Promise<void>;
  audit: (
    backend: string,
    filter: AuditFilter,
  ) => Promise<{ entries: AuditEntry[]; total: number }>;
}

/** Where a setup link points: the dashboard's own address, with the token after `#` so it never reaches a server log. */
export const setupLink = (origin: string, token: string): string => `${origin}/#setup=${token}`;
