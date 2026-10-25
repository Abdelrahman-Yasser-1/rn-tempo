import { open, readdir, readFile, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Directories that never hold project sources (dependencies, build output, VCS). */
export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'Pods',
  '.git',
  'build',
  '.gradle',
  'DerivedData',
  '.yarn',
  '.cxx',
  '.kotlin',
  '.next',
]);

/** Project-relative prefixes skipped by content rewrites (session logs are history, not source). */
export const IGNORED_PREFIXES: readonly string[] = ['.ai/sessions'];

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.bmp', '.heic', '.pdf',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.jar', '.aar', '.keystore', '.jks', '.p12', '.zip', '.gz', '.tgz', '.so', '.a', '.dylib', '.class', '.dex',
  '.mp3', '.mp4', '.mov', '.wav', '.lottie', '.bin', '.hbc',
]);

export type WalkEntry = { rel: string; isDir: boolean };

/** Converts an OS path to the posix form used in manifests and markers. */
export function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/** True when a project-relative posix path is inside an ignored prefix. */
export function isIgnoredPath(rel: string): boolean {
  return IGNORED_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
}

/**
 * Lists every file and directory below `root` (posix, project-relative), skipping `IGNORED_DIRS`
 * and `IGNORED_PREFIXES`. Parents come before their children.
 */
export async function walk(root: string, base = ''): Promise<WalkEntry[]> {
  const entries = await readdir(path.join(root, base), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const out: WalkEntry[] = [];
  for (const entry of entries) {
    const rel = base === '' ? entry.name : `${base}/${entry.name}`;
    if (isIgnoredPath(rel)) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push({ rel, isDir: true });
      out.push(...(await walk(root, rel)));
    } else if (entry.isFile()) {
      out.push({ rel, isDir: false });
    }
  }
  return out;
}

/** Lists project-relative file paths only. */
export async function walkFiles(root: string): Promise<string[]> {
  return (await walk(root)).filter((entry) => !entry.isDir).map((entry) => entry.rel);
}

/** True when the file is text: known binary extensions and files with a null byte are skipped. */
export async function isTextFile(absolutePath: string): Promise<boolean> {
  if (BINARY_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) return false;
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(8000);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return !buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/** Reads a file as UTF-8 text, or returns null for binary files. */
export async function readTextFile(absolutePath: string): Promise<string | null> {
  if (!(await isTextFile(absolutePath))) return null;
  return readFile(absolutePath, 'utf8');
}

/** Whether a path exists. */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Removes empty directories from `start` upwards, never touching `root` itself. */
export async function pruneEmptyDirs(root: string, start: string): Promise<void> {
  let current = path.resolve(start);
  const stop = path.resolve(root);
  while (current !== stop && current.startsWith(stop + path.sep)) {
    try {
      await rmdir(current);
    } catch {
      return; // not empty (or already gone)
    }
    current = path.dirname(current);
  }
}

/** Removes a file or directory tree. */
export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}

/**
 * Rejects paths that could leave the project: POSIX or Windows absolute paths, drive letters, UNC
 * prefixes and `..` segments (backslashes are treated as separators so `..\\x` is caught too).
 */
export function assertInsideProject(rel: string, what: string): void {
  const unified = rel.replaceAll('\\', '/');
  const normalized = path.posix.normalize(unified);
  const escapes =
    rel.length === 0 ||
    path.posix.isAbsolute(unified) ||
    path.win32.isAbsolute(rel) ||
    /^[A-Za-z]:/.test(rel) ||
    unified.startsWith('//') ||
    normalized === '..' ||
    normalized.startsWith('../');
  if (escapes) throw new Error(`${what} "${rel}" must stay inside the project`);
}

/** Converts a glob (`**`, `*`, `?`, `{a,b}`) to a RegExp over posix paths. `dir/**` also matches `dir`. */
export function globToRegExp(glob: string): RegExp {
  let source = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob.charAt(i);
    if (char === '*') {
      if (glob[i + 1] === '*') {
        const atEnd = i + 2 >= glob.length;
        const afterSlash = glob[i + 2] === '/';
        if (afterSlash) {
          source += '(?:.*/)?';
          i += 2;
        } else if (atEnd) {
          source += '.*';
          i += 1;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{') {
      braceDepth += 1;
      source += '(?:';
    } else if (char === '}' && braceDepth > 0) {
      braceDepth -= 1;
      source += ')';
    } else if (char === ',' && braceDepth > 0) {
      source += '|';
    } else {
      source += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
  }
  // `dir/**` should match `dir` itself as well as everything below it.
  if (source.endsWith('/.*')) source = `${source.slice(0, -3)}(?:/.*)?`;
  return new RegExp(`^${source}$`);
}
