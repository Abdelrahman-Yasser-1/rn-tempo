#!/usr/bin/env node
// Release builds only: regenerates src/assets/generated with just the icons the app uses, so the
// JS bundle does not carry all of src/assets/icons. `IconName` stays the full union (the code
// still type-checks); `ICONS` becomes a Partial record. Undo with `yarn icons:prune --restore`.
//
//   yarn icons:prune             keep the icons named by a string literal in src, plus ICON_KEEP
//   yarn icons:prune --restore   run `yarn assets` again (every icon)
//   node scripts/icons-prune.mjs --exec <command...>
//                                prune, run the command, restore (also when it fails); exits with
//                                the command's status. For the release package scripts.
//
// An icon counts as used when its name appears as a string literal ('x', "x" or `x` without
// expressions) in src/**/*.{ts,tsx}, ignoring tests, stories and src/assets/generated. That is
// deliberately generous: a typed constant or a map of names keeps its icons. Names built at
// runtime go in src/assets/icons.keep.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetsCacheDir, generateAssets, readAssetSources } from './assets.mjs';

const SOURCE_FILE = /\.tsx?$/;
const IGNORED_SOURCE = /(?:\.test\.tsx?|\.stories\.tsx?|\.d\.ts)$/;
const IGNORED_FOLDERS = new Set(['__tests__', '__mocks__', 'generated', 'node_modules']);
// 'name', "name" or `name` where name looks like an icon name; no expressions inside.
const NAME_LITERAL = /(['"`])([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\1/g;

/** The app's source files: src/**\/*.{ts,tsx} without tests, stories and generated code. */
export function listSourceFiles(srcDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_FOLDERS.has(entry.name)) {
          visit(join(dir, entry.name));
        }
      } else if (SOURCE_FILE.test(entry.name) && !IGNORED_SOURCE.test(entry.name)) {
        files.push(join(dir, entry.name));
      }
    }
  };
  if (existsSync(srcDir)) {
    visit(srcDir);
  }
  return files.sort();
}

/** Every string literal in `code` that is shaped like an icon name. */
export function nameLiterals(code) {
  return new Set([...code.matchAll(NAME_LITERAL)].map((match) => match[2]));
}

/** The names listed in `icons.keep.ts` (`ICON_KEEP`); an absent file keeps nothing extra. */
export function readKeepList(keepFile) {
  return existsSync(keepFile) ? nameLiterals(readFileSync(keepFile, 'utf8')) : new Set();
}

/** The icon names (of `allNames`) the app uses, from source literals and the keep list. */
export function findUsedIcons({ srcDir, keepFile, allNames }) {
  const known = new Set(allNames);
  const used = new Set();
  const found = [
    ...listSourceFiles(srcDir).map((file) => nameLiterals(readFileSync(file, 'utf8'))),
    readKeepList(keepFile),
  ];
  for (const literals of found) {
    for (const name of literals) {
      if (known.has(name)) {
        used.add(name);
      }
    }
  }
  return used;
}

/** Regenerates `generatedDir` with only the used icons. Returns the counts and the bytes saved. */
export function pruneIcons({ srcDir, assetsDir, generatedDir, cacheDir }) {
  const { sources } = readAssetSources(assetsDir);
  const used = findUsedIcons({
    srcDir,
    keepFile: join(assetsDir, 'icons.keep.ts'),
    allNames: sources.icons.map((icon) => icon.name),
  });
  const removed = sources.icons.filter((icon) => !used.has(icon.name));
  generateAssets(assetsDir, generatedDir, { onlyIcons: used, cacheDir });
  return {
    kept: used.size,
    total: sources.icons.length,
    // The SVG source size stands in for the component size, which is about as large.
    bytesSaved: removed.reduce((sum, icon) => sum + icon.content.length, 0),
  };
}

/** Prunes, runs `command`, then restores whatever happens, and returns the command's exit status. */
export function runPruned(command, { prune, restore }) {
  prune();
  try {
    const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
    return result.status ?? 1;
  } finally {
    restore();
  }
}

function main() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const assetsDir = join(rootDir, 'src/assets');
  const generatedDir = join(assetsDir, 'generated');
  const restore = () =>
    spawnSync(process.execPath, [join(rootDir, 'scripts/assets.mjs')], { stdio: 'inherit' });
  const prune = () => {
    const { kept, total, bytesSaved } = pruneIcons({
      srcDir: join(rootDir, 'src'),
      assetsDir,
      generatedDir,
      cacheDir: assetsCacheDir(rootDir),
    });
    console.log(
      `${relative(rootDir, generatedDir).split(sep).join('/')}: kept ${kept} / ${total} icons, ` +
        `about ${(bytesSaved / 1024).toFixed(0)} KiB of icon source left out of the bundle.`,
    );
  };
  try {
    const execAt = process.argv.indexOf('--exec');
    if (execAt !== -1) {
      process.exit(
        runPruned(process.argv.slice(execAt + 1), {
          prune,
          restore: () => {
            restore();
          },
        }),
      );
    }
    if (process.argv.includes('--restore')) {
      process.exit(restore().status ?? 1);
    }
    prune();
    console.log('Restore all icons with: yarn icons:prune --restore');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
