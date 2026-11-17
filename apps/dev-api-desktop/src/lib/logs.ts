export interface LogView {
  lines: string[];
  /** The CLI's own message when there is no log yet. */
  notice: string | null;
}

/** Turns the output of `tempo-api logs` into lines. A non-zero exit is the CLI saying there is no log. */
export function parseLogs(output: { code: number; stdout: string; stderr: string }, filter: string): LogView {
  if (output.code !== 0) {
    const message = output.stderr.trim().replace(/^tempo-api:\s*/, '');
    return { lines: [], notice: message === '' ? 'No log yet.' : message.split('\n')[0] ?? 'No log yet.' };
  }
  const needle = filter.trim().toLowerCase();
  const lines = output.stdout.split('\n').filter((line) => line.trim() !== '');
  return { lines: needle === '' ? lines : lines.filter((line) => line.toLowerCase().includes(needle)), notice: null };
}
