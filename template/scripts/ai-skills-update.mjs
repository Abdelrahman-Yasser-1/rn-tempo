#!/usr/bin/env node
// Vendors third-party AI skills into `ai/skills/<name>/` from the pinned commits in
// `ai/skills-lock.json`. Dependency-free Node ESM (Node >= 22: global fetch).
//
//   yarn ai:skills:update              re-fetch every skill at its pinned commit
//   yarn ai:skills:update --latest     move every skill to the default branch HEAD (updates the lock)
//   yarn ai:skills:update --only <n>   limit to one skill
//   yarn ai:skills:update --check      offline: verify the vendored files against the lock hashes
//
// Only text files (.md, .yaml, .yml) are kept; image files are dropped and image links in the
// markdown are removed. Run `yarn ai:sync` afterwards to refresh `.claude/skills`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.md', '.yaml', '.yml']);
const IMAGE_LINE = /^\s*!\[[^\]]*\]\([^)]*\.(?:png|jpe?g|gif|webp|svg)(?:\s+"[^"]*")?\)\s*$/i;
const IMAGE_INLINE = /!\[([^\]]*)\]\([^)]*\.(?:png|jpe?g|gif|webp|svg)(?:\s+"[^"]*")?\)/gi;

/** Drops image links from markdown: lines that only hold an image vanish, inline ones keep their alt text. */
export function stripImages(markdown) {
  return markdown
    .split('\n')
    .filter((line) => !IMAGE_LINE.test(line))
    .join('\n')
    .replaceAll(IMAGE_INLINE, '$1');
}

/** Files kept for a skill: text only. */
export function isVendoredFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** sha256 over the sorted `path NUL content NUL` records of the vendored files. */
export function hashFiles(files) {
  const hash = createHash('sha256');
  for (const [file, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${file}\0${content}\0`);
  }
  return hash.digest('hex');
}

function listFiles(dir, prefix = '') {
  const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [];
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`],
    );
}

/** Reads the vendored files of a skill from disk (everything but VENDORED.md). */
export function readVendored(skillDir) {
  return listFiles(skillDir)
    .filter((file) => file !== 'VENDORED.md')
    .map((file) => [file, readFileSync(path.join(skillDir, file), 'utf8')]);
}

/** Text of the per-skill provenance note. */
export function vendoredNote(name, entry) {
  return [
    `# ${name}`,
    '',
    'Vendored third-party skill. Do not edit by hand: `yarn ai:skills:update` overwrites this folder.',
    '',
    `- Source: https://github.com/${entry.source}`,
    `- Path: \`${entry.skillPath}\``,
    `- Commit: \`${entry.commit}\``,
    `- License: ${entry.license} (see \`LICENSE\`)`,
    `- Vendored: ${entry.vendoredAt}`,
    '- Changes: only `.md` and `.yaml` files are kept; image files and image links are removed.',
    '',
  ].join('\n');
}

async function getJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tempo-ai-skills-update' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'tempo-ai-skills-update' } });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.text();
}

async function resolveCommit(entry, isLatest) {
  if (!isLatest) {
    return entry.commit;
  }
  const head = await getJson(`https://api.github.com/repos/${entry.source}/commits/HEAD`);
  return head.sha;
}

/** Downloads one skill at a commit and returns its files as `[relativePath, content]`. */
async function fetchSkill(entry, commit) {
  const tree = await getJson(
    `https://api.github.com/repos/${entry.source}/git/trees/${commit}?recursive=1`,
  );
  if (tree.truncated) {
    throw new Error(`${entry.source} tree is truncated; cannot vendor safely`);
  }
  const root = `${entry.skillPath}/`;
  const paths = tree.tree
    .filter((node) => node.type === 'blob' && node.path.startsWith(root))
    .map((node) => node.path)
    .filter(isVendoredFile);
  const raw = (file) => `https://raw.githubusercontent.com/${entry.source}/${commit}/${file}`;
  const files = [];
  for (const file of paths) {
    const text = await getText(raw(file));
    const relative = file.slice(root.length);
    files.push([relative, relative.endsWith('.md') ? stripImages(text) : text]);
  }
  files.push(['LICENSE', await getText(raw(entry.licensePath))]);
  return files;
}

function parseArgs(argv) {
  const only = argv.indexOf('--only');
  return {
    isLatest: argv.includes('--latest'),
    isCheck: argv.includes('--check'),
    only: only === -1 ? undefined : argv[only + 1],
  };
}

/** Runs the command; returns the process exit code. */
export async function main(argv, cwd = process.cwd()) {
  const { isLatest, isCheck, only } = parseArgs(argv);
  const lockPath = path.join(cwd, 'ai/skills-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const names = Object.keys(lock.skills).filter((name) => only === undefined || name === only);
  if (names.length === 0) {
    console.error(`No skill matches ${only ?? '(none in the lock)'}.`);
    return 1;
  }

  if (isCheck) {
    let isClean = true;
    for (const name of names) {
      const actual = hashFiles(readVendored(path.join(cwd, 'ai/skills', name)));
      const isMatch = actual === lock.skills[name].computedHash;
      isClean &&= isMatch;
      console.log(`${isMatch ? 'ok     ' : 'CHANGED'} ${name}`);
    }
    return isClean ? 0 : 1;
  }

  for (const name of names) {
    const entry = lock.skills[name];
    const commit = await resolveCommit(entry, isLatest);
    const files = await fetchSkill(entry, commit);
    const next = {
      ...entry,
      commit,
      computedHash: hashFiles(files),
      vendoredAt:
        commit === entry.commit && entry.vendoredAt
          ? entry.vendoredAt
          : new Date().toISOString().slice(0, 10),
    };
    const skillDir = path.join(cwd, 'ai/skills', name);
    rmSync(skillDir, { recursive: true, force: true });
    for (const [file, content] of files) {
      mkdirSync(path.dirname(path.join(skillDir, file)), { recursive: true });
      writeFileSync(path.join(skillDir, file), content);
    }
    writeFileSync(path.join(skillDir, 'VENDORED.md'), vendoredNote(name, next));
    lock.skills[name] = next;
    console.log(`${name} @ ${commit.slice(0, 7)} (${files.length} files)`);
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('Now run `yarn ai:sync` to refresh the tool folders.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(
    process.argv.slice(2),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
}
