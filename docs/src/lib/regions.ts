import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Matches a docs region marker in any line-comment, HTML-comment, JSX-comment or block-comment syntax.
 * Group 1 is `region` or `endregion`, group 2 the region name.
 */
const MARKER = /(?:\/\/|#|<!--|\{\/\*|\/\*)\s*#(region|endregion)(?:\s+([\w./-]+))?/;

type Marker = { kind: 'region' | 'endregion'; name: string | undefined };

function parseMarker(line: string): Marker | undefined {
  const match = MARKER.exec(line);
  if (!match) return undefined;
  return { kind: match[1] === 'region' ? 'region' : 'endregion', name: match[2] };
}

/** Removes the indentation shared by every non-blank line. */
function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => /^\s*/.exec(line)?.[0].length ?? 0);
  const shared = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(shared));
}

/**
 * Returns the code of the named `#region` in `source`, without any region marker lines.
 * Throws when the region is missing, unterminated, duplicated or empty, so the docs build fails.
 */
export function extractRegion(source: string, region: string, file: string): string {
  const lines = source.split(/\r?\n/);
  const starts = lines.filter((line) => {
    const marker = parseMarker(line);
    return marker?.kind === 'region' && marker.name === region;
  });
  if (starts.length === 0) {
    throw new Error(`Region "${region}" not found in ${file}`);
  }
  if (starts.length > 1) {
    throw new Error(`Region "${region}" is defined more than once in ${file}`);
  }

  const start = lines.findIndex((line) => line === starts[0]);
  const body: string[] = [];
  let closed = false;
  for (const line of lines.slice(start + 1)) {
    const marker = parseMarker(line);
    if (marker?.kind === 'endregion' && marker.name === region) {
      closed = true;
      break;
    }
    // Markers of other (nested) regions are not code the reader should see.
    if (!marker) body.push(line);
  }
  if (!closed) {
    throw new Error(`Region "${region}" in ${file} has no matching #endregion`);
  }
  if (body.every((line) => line.trim().length === 0)) {
    throw new Error(`Region "${region}" in ${file} is empty`);
  }

  return dedent(body).join('\n');
}

/** Parses `"1,3-5"` or `[1, 3]` into a set of 1-based line numbers. */
export function parseHighlight(highlight: string | number[] | undefined): Set<number> {
  const result = new Set<number>();
  if (highlight === undefined) return result;
  if (Array.isArray(highlight)) {
    for (const line of highlight) result.add(line);
    return result;
  }
  for (const part of highlight.split(',')) {
    const [from, to] = part.trim().split('-').map(Number);
    if (from === undefined || Number.isNaN(from) || (to !== undefined && Number.isNaN(to))) {
      throw new Error(`Invalid highlight "${highlight}"`);
    }
    for (let line = from; line <= (to ?? from); line += 1) result.add(line);
  }
  return result;
}

/**
 * Reads `file` (relative to the repo root) and returns its code, or only the named region.
 * Throws when the file or the region does not exist.
 */
export function readRepoCode(file: string, region: string | undefined, repoRoot: string): string {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) {
    throw new Error(`AnnotatedCode: ${file} is outside the repo root`);
  }
  let source: string;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (error) {
    throw new Error(`AnnotatedCode: cannot read ${file} (looked in ${absolute})`, { cause: error });
  }
  return region === undefined ? source.replace(/\n$/, '') : extractRegion(source, region, file);
}

/** The repo root. The docs build runs inside `docs/`, so it is one level up unless overridden. */
export function getRepoRoot(): string {
  return process.env.DOCS_REPO_ROOT ?? path.resolve(process.cwd(), '..');
}

const LANGUAGES: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.gradle': 'groovy',
  '.rb': 'ruby',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.sh': 'bash',
  '.xml': 'xml',
  '.plist': 'xml',
  '.md': 'md',
  '.mdx': 'mdx',
};

/** Maps a file name to a Shiki language id; unknown extensions render as plain text. */
export function languageFor(file: string): string {
  const name = path.basename(file);
  if (name === 'Podfile' || name === 'Gemfile') return 'ruby';
  return LANGUAGES[path.extname(file)] ?? 'text';
}
