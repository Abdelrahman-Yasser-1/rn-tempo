import type { ReactNode } from 'react';

import type { RunState } from '../api/types';

const WORDS: Record<RunState, string> = { running: 'running', stopped: 'stopped', starting: 'starting', error: 'error' };

export function StatusDot({ state }: { state: RunState }) {
  return <span className={`dot ${state}`} role="img" aria-label={WORDS[state]} />;
}

/** One sentence that says what to do next. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A small "?" that explains a word in plain language. It is reachable with the keyboard. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} role="note" title={text} aria-label={text}>
      ?
    </span>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}
