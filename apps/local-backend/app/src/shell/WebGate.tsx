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

/**
 * Shows the sign-in until the browser has a session, then the dashboard. When the server ends the session (it
 * expired, or the server restarted) the sign-in comes back. Pass `session = null` for the desktop shell.
 */
export function WebGate({ session, children }: { session: WebSession | null; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(session === null ? 'signedIn' : 'checking');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session === null) return undefined;
    let cancelled = false;
    session
      .check()
      .then((signedIn) => {
        if (!cancelled) setPhase(signedIn ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!cancelled) setPhase('signedOut');
      });
    const off = session.onExpired(() => {
      setNotice('Your session ended. Sign in again with a login code.');
      setPhase('signedOut');
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [session]);

  if (session === null || phase === 'signedIn') return <>{children}</>;
  if (phase === 'checking') return <p className="muted centered">Connecting to the server…</p>;
  return (
    <Login
      session={session}
      notice={notice}
      onSignedIn={() => {
        setNotice(null);
        setPhase('signedIn');
      }}
    />
  );
}
