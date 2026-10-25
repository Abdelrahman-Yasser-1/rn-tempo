#!/usr/bin/env node
// Reports acceptance criteria (AC-n) in specs/*/spec.md that no test covers: `yarn spec:check [--strict] [--json]`.
// Covered = a Jest test title starting with the AC ID (`it('AC-1: ...')`) or a Maestro flow listing it in `tags:`.
// Fails for specs with status `implemented` or `verified`; `--strict` fails for every status.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENFORCED = new Set(['implemented', 'verified']);
const SKIP_DIRS = new Set([
  'node_modules',
  'android',
  'ios',
  'vendor',
  'coverage',
  '.git',
  '.yarn',
]);
const AC_LINE = /^\s*- \*\*(AC-\d+)\*\*/;
const TEST_TITLE = /\b(?:it|test|describe)(?:\.\w+)*\s*\(\s*(['"`])(AC-\d+)\b/g;

function walk(dir, accept) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : walk(full, accept);
    }
    return accept(entry.name) ? [full] : [];
  });
}

/** Reads `status` from the spec frontmatter and the ACs (struck-through ones do not match). */
export function parseSpec(text) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const status = /^status:\s*(\S+)/m.exec(frontmatter)?.[1] ?? 'draft';
  const criteria = text
    .split('\n')
    .map((line) => AC_LINE.exec(line)?.[1])
    .filter(Boolean);
  return { status, criteria };
}

/** AC IDs used as the first word of Jest test titles. */
export function jestAcIds(text) {
  return [...text.matchAll(TEST_TITLE)].map((match) => match[2]);
}

/** AC IDs listed under `tags:` of a Maestro flow (block list or inline list). */
export function maestroAcIds(text) {
  const ids = [];
  let isInTags = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('tags:')) {
      isInTags = true;
      ids.push(...(line.match(/AC-\d+/g) ?? []));
    } else if (isInTags && /^\s+-/.test(line)) {
      ids.push(...(line.match(/AC-\d+/g) ?? []));
    } else if (isInTags && line.trim() !== '') {
      isInTags = false;
    }
  }
  return ids;
}

/** Test files that can cover a feature's ACs: the feature's own folder, or any file when it has none. */
function candidates(cwd, feature, files) {
  if (!existsSync(path.join(cwd, 'src/features', feature))) {
    return files;
  }
  const marker = `${path.sep}features${path.sep}${feature}${path.sep}`;
  return files.filter(
    (file) => file.includes(marker) || path.basename(file).startsWith(`${feature}-`),
  );
}

/** Computes coverage for every spec. */
export function checkSpecs({ cwd, strict = false }) {
  const specsDir = path.join(cwd, 'specs');
  if (!existsSync(specsDir)) {
    return [];
  }
  const covered = new Map();
  for (const file of walk(path.join(cwd, 'src'), (name) => /\.test\.[jt]sx?$/.test(name))) {
    covered.set(file, jestAcIds(readFileSync(file, 'utf8')));
  }
  for (const file of walk(path.join(cwd, 'e2e'), (name) => /\.ya?ml$/.test(name))) {
    covered.set(file, maestroAcIds(readFileSync(file, 'utf8')));
  }
  const allFiles = [...covered.keys()];
  const folders = readdirSync(specsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
  const specs = [];
  for (const feature of folders) {
    const specFile = path.join(specsDir, feature, 'spec.md');
    if (!existsSync(specFile)) {
      continue;
    }
    const { status, criteria } = parseSpec(readFileSync(specFile, 'utf8'));
    const ids = new Set(candidates(cwd, feature, allFiles).flatMap((file) => covered.get(file)));
    specs.push({
      feature,
      status,
      total: criteria.length,
      uncovered: criteria.filter((id) => !ids.has(id)),
      enforced: strict || ENFORCED.has(status),
    });
  }
  return specs;
}

function statusMark(spec) {
  if (spec.uncovered.length === 0) {
    return 'ok  ';
  }
  return spec.enforced ? 'FAIL' : 'todo';
}

function printReport(specs) {
  for (const spec of specs) {
    const covered = spec.total - spec.uncovered.length;
    console.log(
      `${statusMark(spec)} ${spec.feature} [${spec.status}] ${covered}/${spec.total} ACs covered`,
    );
    for (const id of spec.uncovered) {
      console.log(`       uncovered: ${id}`);
    }
  }
  if (specs.length === 0) {
    console.log('No specs found in specs/*/spec.md');
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cwdIndex = argv.indexOf('--cwd');
  const cwd = path.resolve(cwdIndex === -1 ? process.cwd() : argv[cwdIndex + 1]);
  const specs = checkSpecs({ cwd, strict: argv.includes('--strict') });
  const failed = specs.filter((spec) => spec.enforced && spec.uncovered.length > 0);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: failed.length === 0, specs }, null, 2));
  } else {
    printReport(specs);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
