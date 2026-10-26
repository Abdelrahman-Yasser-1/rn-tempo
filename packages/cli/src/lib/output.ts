import { log } from '@clack/prompts';

import { CliError, errorMessage } from './errors.ts';

/** Options every command accepts. */
export type CommonOptions = {
  cwd: string;
  yes: boolean;
  json: boolean;
};

/** The three shared citty arg definitions (`--yes`, `--json`, `--cwd`). */
export const commonArgs = {
  yes: { type: 'boolean', alias: 'y', description: 'Accept defaults and skip every prompt' },
  json: { type: 'boolean', description: 'Machine output on stdout (logs go to stderr)' },
  cwd: { type: 'string', description: 'Run as if started in this directory' },
} as const;

/**
 * Human logs vs machine output. With `--json`, logs move to stderr and `result` prints one JSON
 * document on stdout; otherwise `result` is a no-op because commands log their own summary.
 */
export type Reporter = {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  step: (message: string) => void;
  result: (data: unknown) => void;
};

/** Creates a reporter for the given output mode. */
export function createReporter(json: boolean): Reporter {
  if (json) {
    const toStderr = (message: string) => {
      process.stderr.write(`${message}\n`);
    };
    return {
      info: toStderr,
      success: toStderr,
      warn: (message) => toStderr(`warning: ${message}`),
      error: (message) => toStderr(`error: ${message}`),
      step: toStderr,
      result: (data) => {
        process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      },
    };
  }
  return {
    info: (message) => log.info(message),
    success: (message) => log.success(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
    step: (message) => log.step(message),
    result: () => undefined,
  };
}

/** Normalizes the shared citty args into `CommonOptions`. */
export function resolveCommon(args: { yes?: boolean; json?: boolean; cwd?: string }): CommonOptions {
  return {
    cwd: args.cwd ?? process.cwd(),
    yes: Boolean(args.yes),
    json: Boolean(args.json),
  };
}

/**
 * Runs a command body, converting thrown errors into exit code 1. With `--json` the error is also
 * printed on stdout as `{ "ok": false, "error": { code, message, details } }`.
 */
export async function runGuarded(json: boolean, body: (reporter: Reporter) => Promise<void>): Promise<void> {
  const reporter = createReporter(json);
  try {
    await body(reporter);
  } catch (error) {
    const known = error instanceof CliError ? error : null;
    const message = errorMessage(error);
    reporter.error(message);
    for (const detail of known?.details ?? []) reporter.error(`  ${detail}`);
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: false, error: { code: known?.code ?? 'ERROR', message, details: known?.details ?? [] } }, null, 2)}\n`,
      );
    }
    process.exitCode = 1;
  }
}
