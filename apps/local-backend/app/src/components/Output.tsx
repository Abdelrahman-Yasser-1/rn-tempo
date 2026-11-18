import type { CliOutput } from '../client/types';

/** The text a CLI command printed. Shown as-is in a monospace block. */
export function Output({ output, title = 'Output' }: { output: CliOutput | null; title?: string }) {
  if (output === null) return null;
  const text = [output.stdout.trim(), output.stderr.trim()].filter((part) => part !== '').join('\n');
  return (
    <section className="output" aria-label={title}>
      <h3>
        {title} <span className={output.code === 0 ? 'ok' : 'bad'}>exit {output.code}</span>
      </h3>
      <pre>{text === '' ? '(no output)' : text}</pre>
    </section>
  );
}
