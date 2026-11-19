import { useEffect, useState, type ReactNode } from 'react';

import type { WebSession } from '../api/client';
import { errorMessage } from '../lib/errors';
import { ErrorNote } from '../ui/bits';

type Phase = 'checking' | 'signedOut' | 'signedIn';

/** The one-time code form. The code goes in the request body, never in a URL. */
function Login({ session, onSignedIn, notice }: { session: WebSession; onSignedIn: () => void; notice: string | null }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await session.login(code.trim());
      onSignedIn();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered login">
      <h1>Tempo Local Backend</h1>
      <p className="muted">Paste the login code that the server printed in its terminal. It works once and expires after 10 minutes.</p>
      {notice === null ? null : <p role="status">{notice}</p>}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Login code
          <input
            value={code}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
        </label>
        <ErrorNote error={error} />
        <div className="row end">
          <button type="submit" className="primary" disabled={busy || code.trim() === ''}>
            Sign in
          </button>
        </div>
      </form>
    </main>
  );
}

/** The team server's sign-in: email and password, then the authenticator code (or a recovery code) when the account has one. */
function PasswordLogin({
  session,
  onSignedIn,
  notice,
}: {
  session: WebSession;
  onSignedIn: () => void;
  notice: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (session.loginPassword === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await session.loginPassword({
        email: email.trim(),
        password,
        ...(needCode ? { code: code.trim() } : {}),
      });
      if (outcome === 'totp') setNeedCode(true);
      else onSignedIn();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered login">
      <h1>Tempo Local Backend</h1>
      <p className="muted">Sign in with your team account.</p>
      {notice === null ? null : <p role="status">{notice}</p>}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            autoFocus
            autoComplete="username"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        {needCode ? (
          <label>
            Authenticator code or recovery code
            <input
              value={code}
              autoFocus
              autoComplete="one-time-code"
              spellCheck={false}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
          </label>
        ) : null}
        <ErrorNote error={error} />
        <div className="row end">
          <button
            type="submit"
            className="primary"
            disabled={
              busy || email.trim() === '' || password === '' || (needCode && code.trim() === '')
            }
          >
            Sign in
          </button>
        </div>
      </form>
    </main>
  );
}

/** The page an invitation link opens: the person chooses a password. The token comes from the part after `#`, so no server log has it. */
function SetupPassword({
  session,
  token,
  onDone,
}: {
  session: WebSession;
  token: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = again !== '' && again !== password;

  const submit = async () => {
    if (session.setup === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await session.setup(token, password);
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered login">
      <h1>Welcome to Tempo Local Backend</h1>
      <p className="muted">
        Choose a password for your account (at least 10 characters). You can add two-step sign-in
        later in your account settings.
      </p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          New password
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="new-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <label>
          Repeat the password
          <input
            type="password"
            value={again}
            autoComplete="new-password"
            onChange={(event) => {
              setAgain(event.target.value);
            }}
          />
        </label>
        {mismatch ? (
          <p role="alert" className="error">
            The two passwords differ.
          </p>
        ) : null}
        <ErrorNote error={error} />
        <div className="row end">
          <button
            type="submit"
            className="primary"
            disabled={busy || password.length < 10 || password !== again}
          >
            Set password
          </button>
        </div>
      </form>
    </main>
  );
}

const setupTokenOf = (hash: string): string | null => {
  const found = /^#setup=([A-Za-z0-9_-]{20,200})$/.exec(hash);
  return found?.[1] ?? null;
};

/**
 * Shows the sign-in until the browser has a session, then the dashboard. When the server ends the session (it
 * expired, or the server restarted) the sign-in comes back. Pass `session = null` for the desktop shell.
 */
export function WebGate({ session, children }: { session: WebSession | null; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(session === null ? 'signedIn' : 'checking');
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [setupToken, setSetupToken] = useState<string | null>(() => setupTokenOf(window.location.hash));

  useEffect(() => {
    if (session === null) return undefined;
    let cancelled = false;
    session
      .check()
      .then((signedIn) => {
        if (cancelled) return;
        setMode(session.mode?.() ?? 'code');
        setPhase(signedIn ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!cancelled) setPhase('signedOut');
      });
    const off = session.onExpired(() => {
      setNotice(session.mode?.() === 'password' ? 'Your session ended. Sign in again.' : 'Your session ended. Sign in again with a login code.');
      setPhase('signedOut');
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [session]);

  if (session === null || phase === 'signedIn') return <>{children}</>;
  if (phase === 'checking') return <p className="muted centered">Connecting to the server…</p>;
  const signedIn = () => {
    setNotice(null);
    setPhase('signedIn');
  };
  if (mode === 'password' && setupToken !== null) {
    return (
      <SetupPassword
        session={session}
        token={setupToken}
        onDone={() => {
          // The token leaves the address bar, and the person signs in with the new password.
          window.history.replaceState(null, '', window.location.pathname);
          setSetupToken(null);
          setNotice('Your password is set. Sign in.');
        }}
      />
    );
  }
  if (mode === 'password') return <PasswordLogin session={session} notice={notice} onSignedIn={signedIn} />;
  return <Login session={session} notice={notice} onSignedIn={signedIn} />;
}
