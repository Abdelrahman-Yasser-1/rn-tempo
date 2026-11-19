import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import {
  KEY_SCOPES,
  setupLink,
  type ApiKeyInfo,
  type AuditEntry,
  type KeyScope,
  type Member,
  type MemberRole,
  type SetupLink,
  type TeamApi,
} from '../api/team';
import { useMe, useRole } from '../hooks/team';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CopyButton } from '../ui/CopyButton';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

const ROLES: readonly MemberRole[] = ['viewer', 'editor', 'admin'];
const ROLE_HELP: Record<MemberRole, string> = {
  viewer: 'Reads everything in this backend, uses Try it and sees the logs.',
  editor: 'Also changes endpoints, data, media, content and app users.',
  admin: 'Also manages members, API keys, settings and backups.',
};

function useTeam(): TeamApi {
  const team = useApi().team;
  if (team === null) throw new Error('The Team area needs a team server.');
  return team;
}

/** A link or key that is shown once. The person copies it now; it cannot be read again. */
function OneTime({
  title,
  value,
  note,
  onDone,
}: {
  title: string;
  value: string;
  note: string;
  onDone: () => void;
}) {
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      <p className="warning">{note}</p>
      <p>
        <code className="break">{value}</code> <CopyButton text={value} />
      </p>
      <div className="row end">
        <button type="button" onClick={onDone}>
          I copied it
        </button>
      </div>
    </section>
  );
}

const linkNote = (setup: SetupLink): string =>
  `Send this link to the person. It works once and expires ${new Date(setup.expiresAt).toLocaleString()}. It is shown only now.`;

function Members({ backend }: { backend: string }) {
  const team = useTeam();
  const role = useRole();
  const me = useMe();
  const queryClient = useQueryClient();
  const key = ['team', backend, 'members'];
  const members = useQuery({ queryKey: key, queryFn: () => team.members(backend) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('viewer');
  const [link, setLink] = useState<{ who: string; setup: SetupLink } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      team.invite(backend, { email: email.trim(), name: name.trim(), role: newRole }),
    onSuccess: async (made) => {
      setLink(made.setup === null ? null : { who: made.member.email, setup: made.setup });
      setEmail('');
      setName('');
      await refresh();
    },
  });
  const act = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: refresh,
  });
  const newLink = useMutation({
    mutationFn: async (member: Member) => ({
      who: member.email,
      setup: await team.resetLink(backend, member.id),
    }),
    onSuccess: (made) => {
      setLink(made);
    },
  });
  const mine = me.data?.account.id;

  return (
    <section className="card" aria-label="Members">
      <h3>
        Members{' '}
        <Hint text="Everyone who can open this backend. The server owner can open every backend and is not listed." />
      </h3>
      <ErrorNote error={members.error ?? invite.error ?? act.error ?? newLink.error} />
      {link === null ? null : (
        <OneTime
          title={`Setup link for ${link.who}`}
          value={setupLink(window.location.origin, link.setup.token)}
          note={linkNote(link.setup)}
          onDone={() => {
            setLink(null);
          }}
        />
      )}
      {members.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : members.data.length === 0 ? (
        <EmptyState>No members yet. Invite someone below.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.data.map((member) => {
              // An admin cannot change another admin or themselves; only the owner can.
              const locked = role !== 'owner' && (member.role === 'admin' || member.id === mine);
              return (
                <tr key={member.id}>
                  <td>
                    {member.name} <span className="muted">{member.email}</span>
                  </td>
                  <td>
                    <select
                      aria-label={`Role of ${member.email}`}
                      value={member.role}
                      disabled={locked || act.isPending}
                      onChange={(event) => {
                        // Read the value now: the mutation runs later, when a controlled select has already gone back.
                        const chosen = event.target.value as MemberRole;
                        act.mutate(() => team.setRole(backend, member.id, chosen));
                      }}
                    >
                      {ROLES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {member.disabled ? 'Disabled' : member.invitePending ? 'Invited' : 'Active'}
                    {member.totp ? ', two-step on' : ''}
                  </td>
                  <td className="actions-cell">
                    {locked ? null : (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          aria-label={`New setup link for ${member.email}`}
                          onClick={() => {
                            newLink.mutate(member);
                          }}
                        >
                          New setup link
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          aria-label={`Reset two-step sign-in of ${member.email}`}
                          disabled={!member.totp}
                          onClick={() => {
                            setResetting(member);
                          }}
                        >
                          Reset two-step
                        </button>
                        <button
                          type="button"
                          className="ghost bad"
                          aria-label={`Remove ${member.email}`}
                          onClick={() => {
                            setRemoving(member);
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <form
        className="stack"
        aria-label="Invite"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <h4>Invite</h4>
        <p className="muted">
          No email is sent. You get a one-time link (valid 24 hours) to pass on yourself. An
          existing account is added directly.
        </p>
        <div className="row">
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="off"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </label>
          <label>
            Name
            <input
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <label>
            Role
            <select
              value={newRole}
              onChange={(event) => {
                setNewRole(event.target.value as MemberRole);
              }}
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="primary"
            disabled={email.trim() === '' || invite.isPending}
          >
            Invite
          </button>
        </div>
        <p className="muted">{ROLE_HELP[newRole]}</p>
      </form>
      {removing === null ? null : (
        <ConfirmDialog
          title="Remove this member?"
          confirmLabel="Remove"
          busy={act.isPending}
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            act.mutate(() => team.removeMember(backend, removing.id));
            setRemoving(null);
          }}
        >
          <p>
            <strong>{removing.email}</strong> can no longer open this backend. Their account stays
            on the server.
          </p>
        </ConfirmDialog>
      )}
      {resetting === null ? null : (
        <ConfirmDialog
          title="Reset two-step sign-in?"
          confirmLabel="Reset"
          busy={act.isPending}
          onCancel={() => {
            setResetting(null);
          }}
          onConfirm={() => {
            act.mutate(() => team.resetTotp(backend, resetting.id));
            setResetting(null);
          }}
        >
          <p>
            <strong>{resetting.email}</strong> is signed out everywhere and signs in with the
            password only until they set up an authenticator again.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function ApiKeys({ backend }: { backend: string }) {
  const team = useTeam();
  const queryClient = useQueryClient();
  const key = ['team', backend, 'keys'];
  const keys = useQuery({ queryKey: key, queryFn: () => team.apiKeys(backend) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<KeyScope>('read-definition');
  const [made, setMade] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  const create = useMutation({
    mutationFn: () => team.createApiKey(backend, { name: name.trim(), scope }),
    onSuccess: async (result) => {
      setMade(result.key);
      setName('');
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (item: ApiKeyInfo) => team.revokeApiKey(backend, item.id),
    onSuccess: refresh,
  });
  const SCOPE_HELP: Record<KeyScope, string> = {
    'read-definition': 'Reads the definition and the snapshot (the test kit and CI).',
    sessions: 'Reserved for CI sessions.',
    admin: "Calls this backend's admin API like an admin.",
    public: 'Lets an app call the public API when this backend asks for an access key.',
  };

  return (
    <section className="card" aria-label="API keys">
      <h3>
        API keys{' '}
        <Hint text="For CI and tools. A key works on this backend only, with the scope you pick. Send it as Authorization: Bearer tlb_… (or x-tempo-access-key for the public scope)." />
      </h3>
      <ErrorNote error={keys.error ?? create.error ?? revoke.error} />
      {made === null ? null : (
        <OneTime
          title="New API key"
          value={made}
          note="Copy the key now. It is stored hashed and cannot be shown again."
          onDone={() => {
            setMade(null);
          }}
        />
      )}
      {keys.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : keys.data.length === 0 ? (
        <EmptyState>No API keys yet.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th>Key</th>
              <th>Last used</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.data.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.scope}</td>
                <td>
                  <code>{item.prefix}…</code>
                </td>
                <td>
                  {item.revokedAt !== null
                    ? 'Revoked'
                    : item.lastUsedAt === null
                      ? 'Never'
                      : new Date(item.lastUsedAt).toLocaleString()}
                </td>
                <td className="actions-cell">
                  {item.revokedAt !== null ? null : (
                    <button
                      type="button"
                      className="ghost bad"
                      aria-label={`Revoke ${item.name}`}
                      onClick={() => {
                        setRevoking(item);
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="stack"
        aria-label="New API key"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="row">
          <label>
            Key name
            <input
              value={name}
              placeholder="CI"
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <label>
            Scope
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as KeyScope);
              }}
            >
              {KEY_SCOPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="primary"
            disabled={name.trim() === '' || create.isPending}
          >
            Create key
          </button>
        </div>
        <p className="muted">{SCOPE_HELP[scope]}</p>
      </form>
      {revoking === null ? null : (
        <ConfirmDialog
          title="Revoke this key?"
          confirmLabel="Revoke"
          busy={revoke.isPending}
          onCancel={() => {
            setRevoking(null);
          }}
          onConfirm={() => {
            revoke.mutate(revoking);
            setRevoking(null);
          }}
        >
          <p>
            Anything that uses <strong>{revoking.name}</strong> stops working right away. This
            cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function Audit({ backend }: { backend: string }) {
  const team = useTeam();
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const log = useQuery({
    queryKey: ['team', backend, 'audit', actor, action],
    queryFn: () => team.audit(backend, { actor, action, limit: 100 }),
  });
  const rows: AuditEntry[] = log.data?.entries ?? [];
  return (
    <section className="card" aria-label="Audit log">
      <h3>
        Audit log{' '}
        <Hint text="Every change made on this backend: who, when, what. Passwords, tokens, keys and file contents are never kept. Entries are deleted after the retention time of the server (90 days by default)." />
      </h3>
      <div className="row">
        <label>
          Who
          <input
            value={actor}
            placeholder="email or key"
            onChange={(event) => {
              setActor(event.target.value);
            }}
          />
        </label>
        <label>
          Action
          <input
            value={action}
            placeholder="e.g. /data"
            onChange={(event) => {
              setAction(event.target.value);
            }}
          />
        </label>
      </div>
      <ErrorNote error={log.error} />
      {log.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState>Nothing recorded yet.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.at).toLocaleString()}</td>
                <td>{entry.actor.label}</td>
                <td>
                  <code>{entry.action}</code>
                </td>
                <td>
                  {entry.target}
                  {entry.summary === null ? null : (
                    <details>
                      <summary>Details</summary>
                      <pre className="code">{JSON.stringify(entry.summary, null, 2)}</pre>
                    </details>
                  )}
                </td>
                <td>{entry.denied ? `Refused (${String(entry.status)})` : String(entry.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Owner only: every account of the server, to disable or enable one. */
function Accounts() {
  const team = useTeam();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ['team', 'accounts'], queryFn: () => team.accounts() });
  const flip = useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      team.setDisabled(id, disabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team', 'accounts'] }),
  });
  return (
    <section className="card" aria-label="All accounts">
      <h3>
        All accounts{' '}
        <Hint text="Everyone with an account on this server. Disabling an account signs it out everywhere and blocks sign-in." />
      </h3>
      <ErrorNote error={accounts.error ?? flip.error} />
      {accounts.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Backends</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.data.map((account) => (
              <tr key={account.id}>
                <td>
                  {account.name} <span className="muted">{account.email}</span>
                </td>
                <td>
                  {account.owner
                    ? 'All (owner)'
                    : account.memberships
                        .map((member) => `${member.backendId} (${member.role})`)
                        .join(', ') || 'None'}
                </td>
                <td>
                  {account.disabled ? 'Disabled' : account.invitePending ? 'Invited' : 'Active'}
                </td>
                <td className="actions-cell">
                  {account.owner ? null : (
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`${account.disabled ? 'Enable' : 'Disable'} ${account.email}`}
                      onClick={() => {
                        flip.mutate({ id: account.id, disabled: !account.disabled });
                      }}
                    >
                      {account.disabled ? 'Enable' : 'Disable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The Team area of one backend, for admins and the owner: members, API keys, the audit log and (owner) all accounts. */
export function TeamTab({ backend }: { backend: string }) {
  const role = useRole();
  return (
    <div className="screen">
      <h2>Team</h2>
      <p className="muted">
        Your role here: <strong>{role}</strong>.
      </p>
      <Members backend={backend} />
      <ApiKeys backend={backend} />
      <Audit backend={backend} />
      {role === 'owner' ? <Accounts /> : null}
    </div>
  );
}
