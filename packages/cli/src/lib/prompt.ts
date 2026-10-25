import { cancel, isCancel } from '@clack/prompts';

import { CliError } from './errors.ts';

/** Unwraps a clack answer; a cancelled prompt (Ctrl+C) aborts the command cleanly. */
export function answer<V>(value: V): Exclude<V, symbol> {
  if (isCancel(value)) {
    cancel('Cancelled');
    throw new CliError('Cancelled', { code: 'CANCELLED' });
  }
  return value as Exclude<V, symbol>;
}

/** True when prompts can be shown: a TTY on stdin and no `--yes`. */
export function isInteractive(yes: boolean): boolean {
  return !yes && Boolean(process.stdin.isTTY);
}

/** Splits `a, b,c` into trimmed non-empty items. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
