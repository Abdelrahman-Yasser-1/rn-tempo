import { useState } from 'react';

/** Copies text to the clipboard. The clipboard can be unavailable, so a failure shows a short note. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setState('done');
        window.setTimeout(() => setState('idle'), 1200);
      },
      () => {
        setState('failed');
      },
    );
  };
  return (
    <button type="button" className="ghost" onClick={copy} aria-label={`${label} ${text}`}>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
