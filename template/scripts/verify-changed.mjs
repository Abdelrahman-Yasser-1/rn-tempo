// Fast pre-commit check: lint, format and name-check only what changed, then typecheck and run related tests.
// Escalates to the full `yarn verify` when a config file changed. `--pr` writes a Markdown report.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = /\.[cm]?[jt]sx?$/;
const FORMATTABLE = /\.(?:[cm]?[jt]sx?|json|md|ya?ml)$/;
const IGNORED = /^(?:android|ios|vendor|coverage|\.yarn|\.claude|\.ai|\.tempo)\//;
const CONFIG_FILES = new Set([
  'package.json',
  'yarn.lock',
  '.yarnrc.yml',
  'tsconfig.json',
  'babel.config.js',
  'metro.config.js',
  'jest.config.js',
  'jest.setup.ts',
  'eslint.config.mjs',
  'prettier.config.mjs',
  '.ls-lint.yml',
  'knip.json',
  'i18next.config.ts',
  '.env.example',
]);
const CONFIG_PREFIXES = ['babel/', '__mocks__/'];
const REPORT_TAIL_LINES = 40;

const toPosix = (file) => file.split(path.sep).join('/');

/** True when a changed file is a config file, so the whole project must be verified. */
export function needsFullRun(files) {
  return files.some((file) => {
    const normalized = toPosix(path.normalize(file));
    return (
      CONFIG_FILES.has(normalized) ||
      CONFIG_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    );
  });
}

/** Parses `--pr` and `--out <file>`. */
export function parseArgs(argv) {
  const options = { pr: false, out: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--pr') {
      options.pr = true;
    } else if (argv[index] === '--out') {
      options.out = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

/** The steps to run for a changed file set: `{ label, command, args }`. */
export function planSteps(changed) {
  const code = changed.filter((file) => CODE.test(file));
  const formattable = changed.filter((file) => FORMATTABLE.test(file));
  const steps = [];
  if (code.length > 0) {
    steps.push({
      label: 'eslint',
      command: 'yarn',
      args: ['eslint', '--max-warnings=0', '--no-warn-ignored', ...code],
    });
  }
  if (formattable.length > 0) {
    steps.push({
      label: 'prettier',
      command: 'yarn',
      args: ['prettier', '--check', ...formattable],
    });
  }
  steps.push({ label: 'ls-lint', command: 'yarn', args: ['ls-lint'] });
  steps.push({ label: 'tsc', command: 'yarn', args: ['tsc', '--noEmit'] });
  if (code.length > 0) {
    steps.push({
      label: 'jest',
      command: 'yarn',
      args: ['jest', '--ci', '--passWithNoTests', '--findRelatedTests', ...code],
    });
  }
  return steps;
}

/** `1.2s` or `3m 04s`. */
export function formatDuration(ms) {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** Markdown report: a step table, then the last lines of every failed step in `<details>`. */
export function renderReport(results) {
  const rows = results.map(
    (result) =>
      `| ${result.label} | ${result.ok ? '✅' : '❌'} | ${formatDuration(result.durationMs)} |`,
  );
  const lines = [
    '## verify:changed',
    '',
    '| Step | Result | Duration |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ];
  for (const result of results.filter((item) => !item.ok)) {
    const tail = result.output.trimEnd().split('\n').slice(-REPORT_TAIL_LINES).join('\n');
    lines.push(
      `<details><summary>${result.label} failed</summary>`,
      '',
      '```text',
      tail,
      '```',
      '',
      '</details>',
      '',
    );
  }
  return lines.join('\n');
}

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

/** The merge base with `origin/main`, falling back to `main`. */
function mergeBase() {
  for (const ref of ['origin/main', 'main']) {
    const result = exec('git', ['merge-base', ref, 'HEAD'], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim() !== '') {
      return result.stdout.trim();
    }
  }
  throw new Error('Cannot find a merge base: neither origin/main nor main exists.');
}

/** Runs one step; with `capture` its output is collected instead of inherited. */
function runStep(step, capture) {
  const started = Date.now();
  if (!capture) {
    console.log(`\n> ${step.label}`);
  }
  const result = exec(
    step.command,
    step.args,
    capture ? { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 } : { stdio: 'inherit' },
  );
  return {
    label: step.label,
    ok: result.status === 0,
    status: result.status ?? 1,
    durationMs: Date.now() - started,
    output: capture ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '',
  };
}

function changedFiles(pr) {
  const names = pr
    ? git(['diff', '--name-only', '--relative', mergeBase()])
    : [
        ...git(['diff', '--name-only', 'HEAD', '--relative']),
        ...git(['diff', '--name-only', '--cached', '--relative']),
        ...git(['ls-files', '--others', '--exclude-standard']),
      ];
  return [...new Set(names)];
}

function emitReport(results, out) {
  const report = renderReport(results);
  if (out) {
    writeFileSync(out, report);
  } else {
    console.log(report);
  }
}

/** The steps for a changed file set, or an empty list when there is nothing to verify. */
function stepsFor(all) {
  if (needsFullRun(all)) {
    console.error('A config file changed: running the full `yarn verify`.');
    return [{ label: 'yarn verify', command: 'yarn', args: ['verify'] }];
  }
  const changed = all
    .filter((file) => existsSync(file) && !IGNORED.test(file))
    .map((file) => path.normalize(file));
  return changed.length === 0 ? [] : planSteps(changed);
}

function main() {
  const { pr, out } = parseArgs(process.argv.slice(2));
  const steps = stepsFor(changedFiles(pr));
  if (steps.length === 0) {
    console.log('No changed files; nothing to verify.');
  }
  const results = [];
  for (const step of steps) {
    const result = runStep(step, pr);
    results.push(result);
    if (!result.ok && !pr) {
      process.exit(result.status);
    }
  }
  if (pr) {
    emitReport(results, out);
    process.exit(results.every((result) => result.ok) ? 0 : 1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
