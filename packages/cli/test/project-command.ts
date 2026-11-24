import { runCommand, type ArgsDef, type CommandDef } from 'citty';
import { vi } from 'vitest';

/** Exercise citty's argument handling, JSON framing and exit status together. */
export async function runJson<T extends ArgsDef>(command: CommandDef<T>, cwd: string, ...args: string[]) {
  let stdout = '';
  let stderr = '';
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { stderr += String(chunk); return true; });
  const previousExitCode = process.exitCode;
  try {
    process.exitCode = undefined;
    await runCommand(command, { rawArgs: [...args, '--json', '--cwd', cwd] });
    return { result: JSON.parse(stdout) as unknown, stderr, exitCode: process.exitCode ?? 0 };
  } finally {
    out.mockRestore();
    err.mockRestore();
    process.exitCode = previousExitCode;
  }
}
