import path from 'node:path';

import { minimatch } from 'minimatch';

const MATCH_OPTIONS = { dot: true };

/** The linted file as a posix path relative to the ESLint `cwd` (what config globs are written against). */
export function relativeFilename(context) {
  return path.relative(context.cwd, context.filename).split(path.sep).join('/');
}

/** True when `relativePath` matches at least one of the globs. */
export function matchesAny(globs, relativePath) {
  return globs.some((glob) => minimatch(relativePath, glob, MATCH_OPTIONS));
}

/** True when an entry's `files`/`ignores` scope covers the file. No `files` means every file. */
export function inScope(entry, relativePath) {
  if (entry.files && !matchesAny(entry.files, relativePath)) {
    return false;
  }
  return !(entry.ignores && matchesAny(entry.ignores, relativePath));
}
