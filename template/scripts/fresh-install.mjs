// Resets the project to a clean install: caches (tempo clean), node_modules, yarn install, then pods on macOS.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The ordered steps: `{ kind: 'exec', command, args }` or `{ kind: 'remove', path }`.
 * `tempo clean` runs only when the CLI is installed; pods are reinstalled by the last step, not by clean.
 */
export function buildPlan({ platform, hasTempo }) {
  const steps = [];
  if (hasTempo) {
    steps.push({ kind: 'exec', command: 'yarn', args: ['tempo', 'clean', '--yes', '--skip-pods'] });
  }
  steps.push(
    { kind: 'remove', path: 'node_modules' },
    { kind: 'exec', command: 'yarn', args: ['install'] },
  );
  if (platform === 'darwin') {
    steps.push({ kind: 'exec', command: 'yarn', args: ['pods'] });
  }
  return steps;
}

/** Single spawn point; yarn is resolved from PATH on purpose. */
function exec(command, args, options) {
  return spawnSync(command, args, options);
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const hasTempo = existsSync(join(root, 'node_modules/.bin/tempo'));
  if (!hasTempo) {
    console.warn(
      'tempo CLI is not installed: skipping `tempo clean` (caches outside node_modules stay).',
    );
  }
  for (const step of buildPlan({ platform: process.platform, hasTempo })) {
    if (step.kind === 'remove') {
      console.log(`\n> remove ${step.path}`);
      rmSync(join(root, step.path), { recursive: true, force: true });
      continue;
    }
    console.log(`\n> ${step.command} ${step.args.join(' ')}`);
    const result = exec(step.command, step.args, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
