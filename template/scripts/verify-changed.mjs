// Fast pre-commit check: lint, format and name-check only what changed, then typecheck and run related tests.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const CODE = /\.[cm]?[jt]sx?$/;
const FORMATTABLE = /\.(?:[cm]?[jt]sx?|json|md|ya?ml)$/;
const IGNORED = /^(?:android|ios|vendor|coverage|\.yarn|\.claude|\.ai|\.tempo)\//;

/** Single spawn point; yarn and git are resolved from PATH on purpose. */
function exec(command, args, options) {
  return spawnSync(command, args, options);
}

function git(args) {
  const result = exec('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.split('\n').filter(Boolean);
}

/** Runs a command with inherited output and exits the script on failure. */
function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = exec(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// `git diff` paths are relative to the repo root; make them relative to template/.
const prefix = git(['rev-parse', '--show-prefix'])[0] ?? '';
const changed = [
  ...new Set([
    ...git(['diff', '--name-only', 'HEAD', '--relative']),
    ...git(['diff', '--name-only', '--cached', '--relative']),
    ...git(['ls-files', '--others', '--exclude-standard']),
  ]),
]
  .filter((file) => existsSync(file) && !IGNORED.test(file))
  .map((file) => path.normalize(file));

if (changed.length === 0) {
  console.log(`No changed files under ${prefix || '.'}; nothing to verify.`);
  process.exit(0);
}

const code = changed.filter((file) => CODE.test(file));
const formattable = changed.filter((file) => FORMATTABLE.test(file));

if (code.length > 0) {
  run('eslint', 'yarn', ['eslint', '--max-warnings=0', ...code]);
}
if (formattable.length > 0) {
  run('prettier', 'yarn', ['prettier', '--check', ...formattable]);
}
run('ls-lint', 'yarn', ['ls-lint']);
run('tsc', 'yarn', ['tsc', '--noEmit']);
if (code.length > 0) {
  run('jest', 'yarn', ['jest', '--ci', '--passWithNoTests', '--findRelatedTests', ...code]);
}
