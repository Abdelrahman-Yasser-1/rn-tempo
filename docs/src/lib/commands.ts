/** Turns a yarn command into its npm equivalent, for the common cases. */
export function toNpm(yarnCommand: string): string {
  const [first = '', ...rest] = yarnCommand.trim().split(/\s+/);
  const tail = rest.join(' ');
  if (first === 'install') return 'npm install';
  if (first === 'add') return `npm install ${tail}`.trim();
  if (first === 'remove') return `npm uninstall ${tail}`.trim();
  if (first === 'dlx') return `npx ${tail}`.trim();
  // `yarn android:dev`, `yarn tsc --noEmit`: scripts run through `npm run`, flags need `--`.
  return `npm run ${first}${tail ? ` -- ${tail}` : ''}`;
}
