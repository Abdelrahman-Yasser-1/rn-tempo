import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { CliError } from './errors.ts';
import { pathExists } from './fs-utils.ts';
import { capture } from './pm.ts';

export async function projectScript(cwd: string, relative: string, code: string): Promise<string> {
  const file = path.resolve(cwd, relative);
  if (!(await pathExists(file))) {
    throw new CliError(`Missing ${relative} in ${cwd}. This project may predate the template script.`, { code });
  }
  // The real path: scripts that run only when `import.meta.url` matches `process.argv[1]` would otherwise do nothing
  // when the project sits behind a symlink (macOS /var -> /private/var, a linked workspace folder).
  return realpath(file);
}

/** Capture stdout for the command result and keep the project's diagnostics on stderr. */
export async function runProjectScript(cwd: string, script: string, args: string[]) {
  const result = await capture(process.execPath, [script, ...args], { cwd });
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
  return result;
}
