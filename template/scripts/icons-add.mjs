#!/usr/bin/env node
// Adds an icon to src/assets/icons and regenerates src/assets/generated, so the new name is in
// the `IconName` autocomplete right away. Every icon of the Tabler set that ships with the
// template is already in src/assets/icons; this adds your own SVG, or fetches a newer Tabler icon.
//
//   yarn icons:add <file.svg | tabler-name> [--as <name>] [--filled]
//   yarn icons:search <term> [--remote]
//
// Dropping a file into src/assets/icons and running `yarn assets` does the same without this script.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svgColors } from './assets.mjs';

/** The @tabler/icons release the bundled set comes from, and the one `icons:add` fetches. */
export const TABLER_VERSION = '3.50.0';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICONS_DIR = join(ROOT_DIR, 'src/assets/icons');
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const OFFLINE_HELP =
  'Could not download the icon from npm (are you offline?). Add an SVG file instead: ' +
  'yarn icons:add ./my-icon.svg [--as <name>].';

/** Lower-case kebab-case of a file or icon name: `My Icon_2.svg` becomes `my-icon-2`. */
export function toKebabCase(name) {
  return name
    .replace(/\.svg$/i, '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}

/**
 * Cleans an SVG for the icon set: drops the XML prolog and comments, makes its single paint color
 * `currentColor`, and removes the root width and height when there is a viewBox (sizes come from
 * the `Icon` props).
 */
export function normalizeSvg(svg) {
  let result = svg
    .replaceAll(/<\?xml[\s\S]*?\?>/g, '')
    .replaceAll(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replaceAll(/<!--[\s\S]*?-->/g, '')
    .trim();
  const [color] = svgColors(result);
  if (color) {
    result = result.replaceAll(
      /\b(fill|stroke|stop-color|color)(\s*[=:]\s*["']?)([^"';\s]+)/g,
      (match, attribute, separator, value) =>
        value.toLowerCase() === color ? `${attribute}${separator}currentColor` : match,
    );
  }
  result = result.replace(/<svg\b[^>]*>/, (tag) =>
    /\sviewBox=/.test(tag) ? tag.replaceAll(/\s(?:width|height)=("[^"]*"|'[^']*')/g, '') : tag,
  );
  return `${result}\n`;
}

/** The icon names in `iconsDir`, sorted: `home`, `home-filled`, ... */
export function localNames(iconsDir = ICONS_DIR) {
  return existsSync(iconsDir)
    ? readdirSync(iconsDir)
        .filter((file) => file.endsWith('.svg'))
        .map((file) => file.slice(0, -'.svg'.length))
        .sort()
    : [];
}

/** Local icon names that contain `term`. */
export function searchLocal(term, iconsDir = ICONS_DIR) {
  const needle = term.trim().toLowerCase();
  return localNames(iconsDir).filter((name) => name.includes(needle));
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(OFFLINE_HELP);
  }
  return result.stdout;
}

/** Downloads the pinned @tabler/icons tarball into a new temp dir and returns its paths. */
function packTabler() {
  const dir = mkdtempSync(join(tmpdir(), 'tabler-icons-'));
  try {
    const file = run('npm', ['pack', `@tabler/icons@${TABLER_VERSION}`, '--silent'], { cwd: dir })
      .trim()
      .split('\n')
      .at(-1);
    return { dir, tarball: join(dir, file) };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

/** The SVG text of a Tabler icon from the pinned package, or null when it has no such icon. */
export function fetchTablerIcon(name, style) {
  const { dir, tarball } = packTabler();
  try {
    const entry = `package/icons/${style}/${name}.svg`;
    const list = run('tar', ['-tzf', tarball]).split('\n');
    return list.includes(entry) ? run('tar', ['-xzOf', tarball, entry]) : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every Tabler icon of the pinned package: `{ style, name }`. */
export function listTablerIcons() {
  const { dir, tarball } = packTabler();
  try {
    return run('tar', ['-tzf', tarball])
      .split('\n')
      .map((line) => /^package\/icons\/(outline|filled)\/(.+)\.svg$/.exec(line))
      .filter(Boolean)
      .map((match) => ({ style: match[1], name: match[2] }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function isLocalSvg(input) {
  return input.includes('/') || input.includes('\\') || extname(input).toLowerCase() === '.svg';
}

function readSvgFile(path) {
  if (!existsSync(path)) {
    throw new Error(`No such file: ${path}`);
  }
  const svg = readFileSync(path, 'utf8');
  if (!/<svg[\s>]/.test(svg)) {
    throw new Error(`${path} is not an SVG file.`);
  }
  return svg;
}

function fetchNamed(input, filled, fetchIcon) {
  const style = filled ? 'filled' : 'outline';
  const svg = fetchIcon(toKebabCase(input), style);
  if (svg === null) {
    throw new Error(
      `Tabler ${TABLER_VERSION} has no ${style} icon named "${input}". ` +
        'Search with: yarn icons:search <term> --remote',
    );
  }
  return svg;
}

/**
 * Adds one icon to `iconsDir` and returns `{ target, status }`. `input` is a path to an `.svg`
 * file, or a Tabler name that is not in the set yet (fetched with `npm pack`; outline unless
 * `filled`). The file is normalized and named in kebab-case (`as` overrides the name; `-filled` is
 * appended for `filled`). Throws a readable error for anything that cannot be added.
 */
export function addIcon(
  { input, filled = false, as },
  { iconsDir = ICONS_DIR, fetchIcon = fetchTablerIcon } = {},
) {
  const fromFile = isLocalSvg(input);
  const baseName = toKebabCase(as ?? (fromFile ? basename(input) : input));
  const targetName = filled && !baseName.endsWith('-filled') ? `${baseName}-filled` : baseName;
  if (!KEBAB_CASE.test(targetName)) {
    throw new Error(`"${as ?? input}" does not make a kebab-case name (for example arrow-left).`);
  }
  const target = join(iconsDir, `${targetName}.svg`);
  if (existsSync(target)) {
    if (!fromFile && as === undefined) {
      return { target, status: 'present' };
    }
    throw new Error(
      `src/assets/icons/${targetName}.svg already exists. Pick another name with --as.`,
    );
  }

  const svg = fromFile ? readSvgFile(input) : fetchNamed(input, filled, fetchIcon);
  writeFileSync(target, normalizeSvg(svg));
  return { target, status: 'added' };
}

/** Parses argv (without node and the script). */
export function parseArgs(argv) {
  const options = { filled: false, remote: false, search: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--filled') {
      options.filled = true;
    } else if (arg === '--remote') {
      options.remote = true;
    } else if (arg === '--search') {
      options.search = true;
    } else if (arg === '--as') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value.`);
      }
      options.as = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new Error(`Expected one icon, got: ${positional.join(' ')}.`);
  }
  return { ...options, input: positional[0] };
}

function search(term, remote) {
  const local = searchLocal(term);
  for (const name of local) {
    console.log(name);
  }
  console.log(`${local.length} local match${local.length === 1 ? '' : 'es'} for "${term}".`);
  if (!remote) {
    return;
  }
  const have = new Set(localNames());
  const needle = term.trim().toLowerCase();
  const available = listTablerIcons().filter(
    ({ style, name }) =>
      name.includes(needle) && !have.has(style === 'filled' ? `${name}-filled` : name),
  );
  console.log(`\nTabler ${TABLER_VERSION} icons you can fetch (yarn icons:add <name> [--filled]):`);
  for (const { style, name } of available) {
    console.log(style === 'filled' ? `${name} --filled` : name);
  }
  console.log(`${available.length} to fetch.`);
}

function main() {
  try {
    const { input, filled, as, search: isSearch, remote } = parseArgs(process.argv.slice(2));
    if (isSearch) {
      if (input === undefined) {
        throw new Error('Usage: yarn icons:search <term> [--remote]');
      }
      search(input, remote);
      return;
    }
    if (input === undefined) {
      throw new Error('Usage: yarn icons:add <file.svg | tabler-name> [--as <name>] [--filled]');
    }
    const { target, status } = addIcon({ input, filled, as });
    if (status === 'present') {
      console.log(`${relative(ROOT_DIR, target)} is already in the set; use it as is.`);
      return;
    }
    console.log(`Added ${relative(ROOT_DIR, target)}.`);
    const result = spawnSync(process.execPath, [join(ROOT_DIR, 'scripts/assets.mjs')], {
      stdio: 'inherit',
    });
    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
