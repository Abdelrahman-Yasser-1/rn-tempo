// Keeps every .env.* file in step with .env.example and keeps the iOS-copied root .env out of git.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keys of a dotenv text: `KEY=value` lines, ignoring blanks and `#` comments (markers included). */
export function parseEnvKeys(text) {
  const keys = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_]\w*)\s*=/.exec(line);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

/** Missing and extra keys of `keys` against the `expected` set. */
export function compareKeys(expected, keys) {
  return {
    missing: [...expected].filter((key) => !keys.has(key)).sort(),
    extra: [...keys].filter((key) => !expected.has(key)).sort(),
  };
}

/** Maps file name to its problems; files that match `.env.example` are left out. */
export function findMismatches(files) {
  const example = files['.env.example'];
  if (example === undefined) {
    return { '.env.example': { missing: [], extra: [], absent: true } };
  }
  const expected = parseEnvKeys(example);
  const result = {};
  for (const [name, text] of Object.entries(files)) {
    if (name === '.env.example') {
      continue;
    }
    const { missing, extra } = compareKeys(expected, parseEnvKeys(text));
    if (missing.length > 0 || extra.length > 0) {
      result[name] = { missing, extra };
    }
  }
  return result;
}

/** Human-readable report lines for the mismatches. */
export function describeMismatches(mismatches) {
  const lines = [];
  for (const [name, problem] of Object.entries(mismatches)) {
    if (problem.absent) {
      lines.push('.env.example is missing.');
      continue;
    }
    lines.push(`${name} differs from .env.example:`);
    if (problem.missing.length > 0) {
      lines.push(`  missing: ${problem.missing.join(', ')}`);
    }
    if (problem.extra.length > 0) {
      lines.push(`  extra: ${problem.extra.join(', ')}`);
    }
  }
  return lines;
}

/** Reads `.env.example` and every `.env.*` file present in `root`. */
export function readEnvFiles(root) {
  const files = {};
  for (const name of readdirSync(root)) {
    if (name === '.env.example' || /^\.env\.[\w-]+$/.test(name)) {
      files[name] = readFileSync(join(root, name), 'utf8');
    }
  }
  return files;
}

/** True when git tracks a root `.env`; false outside a git repo. */
export function isRootEnvTracked(root, exec = spawnSync) {
  const result = exec('git', ['ls-files', '.env'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() === '.env';
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = describeMismatches(findMismatches(readEnvFiles(root)));
  if (isRootEnvTracked(root)) {
    problems.push(
      '.env is tracked by git. It is a copy made by the iOS scheme pre-action; run `git rm --cached .env`.',
    );
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
