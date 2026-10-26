/** An expected failure: printed without a stack trace and mapped to a non-zero exit code. */
export class CliError extends Error {
  readonly code: string;
  readonly details: readonly string[];

  constructor(message: string, options: { code?: string; details?: readonly string[] } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = options.code ?? 'ERROR';
    this.details = options.details ?? [];
  }
}

/** Narrows an unknown thrown value to a printable message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
