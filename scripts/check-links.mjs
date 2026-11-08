// Checks relative links, /docs/ links and #anchors in the docs content and the template Markdown.
// External links are skipped; links inside code are ignored. Dependency-free on purpose.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIPPED_DIRS = new Set([
  'node_modules',
  'Pods',
  '.git',
  '.yarn',
  'coverage',
  'vendor',
  'sessions',
]);
const SKIPPED_PATHS = ['template/ios/Pods', 'template/android/build', 'template/.ai/sessions'];
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const MARKDOWN_LINK = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HREF = /href=(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g;
const REFERENCE = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;

/** GitHub-style slug (what Fumadocs' github-slugger produces): lowercase, drop punctuation but `-` and `_`, spaces to `-`. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replaceAll(' ', '-');
}

/** Blanks fenced code blocks and (unless `inline` is false) inline code, keeping every line (and so every line number) in place. */
export function stripCode(text, { inline = true } = {}) {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
      if (fence === null) {
        if (marker) {
          fence = marker[0];
          return '';
        }
        return inline ? line.replace(/(`+)[^`]*?\1/g, (code) => ' '.repeat(code.length)) : line;
      }
      if (marker?.[0] === fence) {
        fence = null;
      }
      return '';
    })
    .join('\n');
}

function headingText(raw) {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replaceAll('`', '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .trim();
}

/** Anchor ids of every heading in a Markdown/MDX text, with github-slugger's `-1` suffix for duplicates. */
export function headingSlugs(text) {
  const seen = new Map();
  const slugs = new Set();
  for (const line of stripCode(text, { inline: false }).split('\n')) {
    const match = /^ {0,3}#{1,6}\s+(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const custom = /\s*\[#([^\]]+)\]\s*$/.exec(match[1]);
    if (custom) {
      slugs.add(custom[1]);
      continue;
    }
    const base = slugify(headingText(match[1]));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/** Every link target of a text as `{ target, line }`, outside of code. */
export function extractLinks(text) {
  const links = [];
  for (const [index, line] of stripCode(text).split('\n').entries()) {
    for (const match of line.matchAll(MARKDOWN_LINK)) {
      links.push({ target: match[1].replace(/^<|>$/g, ''), line: index + 1 });
    }
    for (const match of line.matchAll(HREF)) {
      links.push({ target: match[1] ?? match[2] ?? match[3], line: index + 1 });
    }
    const reference = REFERENCE.exec(line);
    if (reference) {
      links.push({
        target: reference[1].replace(/^<|>$/g, ''),
        line: index + 1,
      });
    }
  }
  return links;
}

function fileExists(file) {
  return existsSync(file) && statSync(file).isFile();
}

/** The Markdown file a `/docs/...` path points at, or null. */
export function resolveDocsPath(root, docsPath) {
  const base = path.join(root, 'docs/content/docs', docsPath.replace(/^\/docs\/?/, ''));
  const candidates = [
    `${base}.mdx`,
    `${base}.md`,
    path.join(base, 'index.mdx'),
    path.join(base, 'index.md'),
  ];
  return candidates.find(fileExists) ?? null;
}

/** Checks one link; returns a problem message or null. `slugsOf(file)` returns the heading slugs of a Markdown file. */
export function checkLink({ root, file, target, slugsOf }) {
  if (target === '' || EXTERNAL.test(target)) {
    return null;
  }
  const hashAt = target.indexOf('#');
  const rawPath = (hashAt === -1 ? target : target.slice(0, hashAt)).split('?')[0];
  const anchor = hashAt === -1 ? '' : decodeURIComponent(target.slice(hashAt + 1));
  let resolved = file;
  if (rawPath.startsWith('/docs')) {
    resolved = resolveDocsPath(root, rawPath);
    if (!resolved) {
      return `${target}: no docs page for ${rawPath}`;
    }
  } else if (rawPath.startsWith('/')) {
    return null;
  } else if (rawPath !== '') {
    resolved = path.resolve(path.dirname(file), decodeURIComponent(rawPath));
    if (!existsSync(resolved)) {
      return `${target}: file not found`;
    }
  }
  if (
    anchor !== '' &&
    /\.mdx?$/.test(resolved) &&
    fileExists(resolved) &&
    !slugsOf(resolved).has(anchor)
  ) {
    return `${target}: no heading with anchor #${anchor} in ${path.relative(root, resolved)}`;
  }
  return null;
}

/** Markdown files under `dir`, skipping dependency, build and session folders. */
export function collectMarkdown(root, dir, extensions) {
  const found = [];
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (SKIPPED_PATHS.includes(relative) || (entry.isDirectory() && SKIPPED_DIRS.has(entry.name))) {
      continue;
    }
    if (entry.isDirectory()) {
      found.push(...collectMarkdown(root, full, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(full);
    }
  }
  return found;
}

/** Scans the repo and returns `{ file, line, message }` for every broken link. */
export function checkRepo(root) {
  const files = [
    ...collectMarkdown(root, path.join(root, 'docs/content'), ['.md', '.mdx']),
    ...collectMarkdown(root, path.join(root, 'template'), ['.md']),
  ];
  const slugCache = new Map();
  const slugsOf = (file) => {
    if (!slugCache.has(file)) {
      slugCache.set(file, headingSlugs(readFileSync(file, 'utf8')));
    }
    return slugCache.get(file);
  };
  const problems = [];
  for (const file of files) {
    for (const { target, line } of extractLinks(readFileSync(file, 'utf8'))) {
      const message = checkLink({ root, file, target, slugsOf });
      if (message) {
        problems.push({ file: path.relative(root, file), line, message });
      }
    }
  }
  return problems;
}

function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkRepo(root);
  for (const { file, line, message } of problems) {
    console.error(`${file}:${line}  ${message}`);
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} broken link(s).`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
