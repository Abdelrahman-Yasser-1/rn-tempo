import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import type { TeamApi } from '../api/team';
import { meKey, useMe } from '../hooks/team';
import { CopyButton } from '../ui/CopyButton';
import { Modal } from '../ui/Modal';
import { QrCode } from '../ui/QrCode';
import { ErrorNote } from '../ui/bits';

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <section className="card" aria-label="Recovery codes">
      <h4>Recovery codes</h4>
      <p className="warning">
        Keep these somewhere safe. Each one signs you in once if you lose your authenticator. They
        are shown only now.
      </p>
      <ul className="plain codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="row end">
        <CopyButton text={codes.join('\n')} label="Copy all" />
        <button type="button" onClick={onDone}>
          I saved them
        </button>
      </div>
    </section>
  );
}

function Password({ team }: { team: TeamApi }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: () => team.changePassword(current, next),
    onSuccess: () => {
      setDone(true);
      setCurrent('');
      setNext('');
      setAgain('');
    },
  });
  return (
    <form
      className="stack"
      aria-label="Change password"
      onSubmit={(event) => {
        event.preventDefault();
        setDone(false);
        change.mutate();
      }}
    >
      <h3>Password</h3>
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
          }}
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
          }}
        />
      </label>
      <label>
        Repeat the new password
        <input
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => {
            setAgain(event.target.value);
          }}
        />
      </label>
      <ErrorNote error={change.error} />
      {done ? (
        <p className="ok" role="status">
          Password changed. Your other sessions were signed out.
        </p>
      ) : null}
      <div className="row end">
        <button
          type="submit"
          className="primary"
          disabled={current === '' || next.length < 10 || next !== again || change.isPending}
        >
          Change password
        </button>
      </div>
    </form>
  );
}

function TwoStep({ team }: { team: TeamApi }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const account = me.data?.account;
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: meKey });

  const begin = useMutation({ mutationFn: () => team.totpSetup(), onSuccess: setSetup });
  const enable = useMutation({
    mutationFn: () => team.totpEnable(code.trim()),
    onSuccess: async (made) => {
      setCodes(made);
      setSetup(null);
      setCode('');
      await refresh();
    },
  });
  const disable = useMutation({
    mutationFn: () => team.totpDisable(password),
    onSuccess: async () => {
      setPassword('');
      await refresh();
    },
  });
  const renew = useMutation({
    mutationFn: () => team.newRecoveryCodes(password),
    onSuccess: async (made) => {
      setCodes(made);
      setPassword('');
      await refresh();
    },
  });

  if (account === undefined) return null;
  return (
    <section className="stack" aria-label="Two-step sign-in">
      <h3>Two-step sign-in</h3>
      {codes === null ? null : (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
          }}
        />
      )}
      {account.totp ? (
        <>
          <p>
            On. {account.recoveryCodesLeft} recovery{' '}
            {account.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.
          </p>
          <label>
            Your password (to change this)
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
          <ErrorNote error={disable.error ?? renew.error} />
          <div className="row end">
            <button
              type="button"
              disabled={password === '' || renew.isPending}
              onClick={() => {
                renew.mutate();
              }}
            >
              New recovery codes
            </button>
            <button
              type="button"
              className="danger"
              disabled={password === '' || disable.isPending}
              onClick={() => {
                disable.mutate();
              }}
            >
              Turn off
            </button>
          </div>
        </>
      ) : setup === null ? (
        <>
          <p className="muted">
            Ask for a code from an authenticator app (1Password, Google Authenticator, Authy) after
            the password.
          </p>
          <ErrorNote error={begin.error} />
          <div className="row end">
            <button
              type="button"
              className="primary"
              disabled={begin.isPending}
              onClick={() => {
                begin.mutate();
              }}
            >
              Set up
            </button>
          </div>
        </>
      ) : (
        <form
          className="stack"
          aria-label="Confirm two-step sign-in"
          onSubmit={(event) => {
            event.preventDefault();
            enable.mutate();
          }}
        >
          <p>Scan this with your authenticator app, then type the 6-digit code it shows.</p>
          <QrCode text={setup.uri} label="QR code for the authenticator app" />
          <p className="muted">
            Cannot scan? Type this key into the app: <code className="break">{setup.secret}</code>
          </p>
          <label>
            Code from the app
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </label>
          <ErrorNote error={enable.error} />
          <div className="row end">
            <button
              type="button"
              onClick={() => {
                setSetup(null);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={code.trim().length !== 6 || enable.isPending}
            >
              Turn on
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Your own account on a team server: password, two-step sign-in, recovery codes. */
export function Profile({ onClose }: { onClose: () => void }) {
  const team = useApi().team;
  const me = useMe();
  if (team === null) return null;
  return (
    <Modal title="Your account" onClose={onClose} wide>
      <p className="muted">
        {me.data?.account.name} ({me.data?.account.email})
        {me.data?.account.owner ? ', server owner' : ''}
      </p>
      <div className="stack">
        <Password team={team} />
        <TwoStep team={team} />
      </div>
      <div className="row end">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
