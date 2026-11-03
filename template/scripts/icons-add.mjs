#!/usr/bin/env node
// Copies an icon from the Tabler catalogue (assets-catalog/icons, never bundled) into
// src/assets/icons, then regenerates src/assets/generated.
//
//   yarn icons:add <name> [--filled] [--as <newName>]
//   yarn icons:search <term>
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE_DIR = join(ROOT_DIR, 'assets-catalog/icons');
const ICONS_DIR = join(ROOT_DIR, 'src/assets/icons');
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STYLES = ['outline', 'filled'];

/** The catalogue names of one style, sorted. */
export function catalogueNames(style, catalogueDir = CATALOGUE_DIR) {
  const dir = join(catalogueDir, style);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.svg'))
        .map((file) => file.slice(0, -'.svg'.length))
        .sort()
    : [];
}

/** Catalogue entries whose name contains `term`: `{ style, name }`, outline first. */
export function searchIcons(term, catalogueDir = CATALOGUE_DIR) {
  const needle = term.trim().toLowerCase();
  return STYLES.flatMap((style) =>
    catalogueNames(style, catalogueDir)
      .filter((name) => name.includes(needle))
      .map((name) => ({ style, name })),
  );
}

/**
 * Copies `<style>/<name>.svg` to `<iconsDir>/<as ?? name>[-filled].svg` and returns the target
 * path. Throws a readable error for an unknown name, a bad target name or an existing icon.
 */
export function addIcon(
  { name, filled = false, as },
  { catalogueDir = CATALOGUE_DIR, iconsDir = ICONS_DIR } = {},
) {
  const style = filled ? 'filled' : 'outline';
  const source = join(catalogueDir, style, `${name}.svg`);
  if (!existsSync(source)) {
    const similar = searchIcons(name, catalogueDir)
      .filter((entry) => entry.style === style)
      .slice(0, 5)
      .map((entry) => entry.name);
    const hint = similar.length > 0 ? ` Did you mean: ${similar.join(', ')}?` : '';
    throw new Error(`No ${style} icon named "${name}" in the catalogue.${hint}`);
  }
  const targetName = `${as ?? name}${filled ? '-filled' : ''}`;
  if (!KEBAB_CASE.test(targetName)) {
    throw new Error(`"${targetName}" is not a kebab-case name (for example arrow-left).`);
  }
  const target = join(iconsDir, `${targetName}.svg`);
  if (existsSync(target)) {
    throw new Error(`src/assets/icons/${targetName}.svg already exists.`);
  }
  copyFileSync(source, target);
  return target;
}

/** Parses argv (without node and the script): positional name, `--filled`, `--as x`, `--search x`. */
export function parseArgs(argv) {
  const options = { filled: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--filled') {
      options.filled = true;
    } else if (arg === '--as' || arg === '--search') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value.`);
      }
      options[arg === '--as' ? 'as' : 'search'] = value;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new Error(`Expected one icon name, got: ${positional.join(' ')}.`);
  }
  return { ...options, name: positional[0] };
}

function main() {
  try {
    const { name, filled, as, search } = parseArgs(process.argv.slice(2));
    if (search !== undefined) {
      const matches = searchIcons(search);
      for (const { style, name: match } of matches) {
        console.log(style === 'filled' ? `${match} --filled` : match);
      }
      console.log(`${matches.length} match${matches.length === 1 ? '' : 'es'} for "${search}".`);
      return;
    }
    if (name === undefined) {
      throw new Error('Usage: yarn icons:add <name> [--filled] [--as <newName>]');
    }
    const target = addIcon({ name, filled, as });
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
