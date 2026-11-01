import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { pathExists } from './fs-utils.ts';

export type RegisterOptions = {
  projectDir: string;
  /** Stack name, e.g. `Home` (maps to `HomeStackParamList` and `createHomeStack`). */
  stack: string;
  /** Route name, e.g. `Balance`. */
  routeName: string;
  /** Screen component, e.g. `BalanceScreen`. */
  component: string;
  /** Module the component is imported from, e.g. `@features/wallet`. */
  importFrom: string;
  /** Also add the screen to the stack navigator file. */
  navigator: boolean;
};

export type RegisterResult = { updated: string[]; notes: string[] };

const TYPES_FILE = 'src/navigation/types.ts';
const NAVIGATION_DIR = 'src/navigation';

/** Index of the `}` that closes the `{` at `open`, ignoring braces in strings and comments. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const char = text.charAt(i);
    const next = text.charAt(i + 1);
    if (quote !== null) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = null;
    } else if (char === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      if (end === -1) return -1;
      i = end;
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type Block = { open: number; close: number; indent: string };

/** Locates the `{ ... }` that follows `anchor` in `text`. */
function findBlock(text: string, anchor: RegExp): Block | null {
  const match = anchor.exec(text);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  const close = matchingBrace(text, open);
  if (close === -1) return null;
  const lineStart = text.lastIndexOf('\n', match.index) + 1;
  return { open, close, indent: /^\s*/.exec(text.slice(lineStart))?.[0] ?? '' };
}

/** Inserts `line` as the last entry of the block, one indent level deeper than the block. */
function insertInBlock(text: string, block: Block, entry: string): string {
  const before = text.slice(0, block.close).replace(/[ \t]*$/, '');
  return `${before}${block.indent}  ${entry}\n${block.indent}${text.slice(block.close)}`;
}

function hasKey(text: string, block: Block, name: string): boolean {
  return new RegExp(`^\\s*${name}\\s*:`, 'm').test(text.slice(block.open, block.close));
}

function addRouteToTypes(text: string, stack: string, routeName: string): { text: string; changed: boolean } | null {
  const block = findBlock(text, new RegExp(`export type ${stack}StackParamList\\s*=\\s*\\{`));
  if (!block) return null;
  if (hasKey(text, block, routeName)) return { text, changed: false };
  return { text: insertInBlock(text, block, `${routeName}: undefined;`), changed: true };
}

const ALIAS_IMPORT = /^import .* from '@(?:features|shared|services|theme|locales|test-utils|app|navigation)\//;

/** Adds `{ name }` from `source`, merging into an existing import and keeping the alias group together. */
function addImport(text: string, name: string, source: string): string {
  const lines = text.split('\n');
  const existing = lines.findIndex((value) => value.startsWith('import {') && value.endsWith(`} from '${source}';`));
  if (existing !== -1) {
    const names = /^import \{(.*)\} from/.exec(lines.at(existing) ?? '')?.[1]?.split(',').map((item) => item.trim()) ?? [];
    if (names.includes(name)) return text;
    lines[existing] = `import { ${[...names, name].sort().join(', ')} } from '${source}';`;
    return lines.join('\n');
  }
  const line = `import { ${name} } from '${source}';`;
  const alias = lines.findLastIndex((value) => ALIAS_IMPORT.test(value));
  if (alias !== -1) {
    lines.splice(alias + 1, 0, line);
    return lines.join('\n');
  }
  const relative = lines.findIndex((value) => value.startsWith('import ') && /from '\.\.?\//.test(value));
  if (relative !== -1) {
    lines.splice(relative, 0, line, '');
    return lines.join('\n');
  }
  const last = lines.findLastIndex((value) => value.startsWith('import '));
  lines.splice(last + 1, 0, ...(last === -1 ? [line, ''] : ['', line]));
  return lines.join('\n');
}

function addScreenToNavigator(text: string, options: RegisterOptions): { text: string; changed: boolean } | null {
  const { stack, routeName, component, importFrom } = options;
  const fn = new RegExp(`function create${stack}(?:Stack|Navigator)\\s*\\([^)]*\\)[^{]*\\{`);
  const fnMatch = fn.exec(text);
  if (!fnMatch) return null;
  const rest = text.slice(fnMatch.index);
  const screens = findBlock(rest, /screens\s*:\s*\{/);
  if (!screens) return null;
  const offset = fnMatch.index;
  const block: Block = { open: screens.open + offset, close: screens.close + offset, indent: screens.indent };
  if (hasKey(text, block, routeName)) return { text, changed: false };
  const entry = `${routeName}: { screen: ${component} },`;
  const withEntry = insertInBlock(text, block, entry);
  return { text: addImport(withEntry, component, importFrom), changed: true };
}

async function navigatorFiles(projectDir: string): Promise<string[]> {
  const dir = path.join(projectDir, NAVIGATION_DIR);
  if (!(await pathExists(dir))) return [];
  const names = await readdir(dir);
  return names.filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'types.ts').sort();
}

/**
 * Adds a route to the stack's ParamList in `src/navigation/types.ts` and, with `navigator`, to the
 * stack navigator. Idempotent; an unrecognised structure produces a note instead of an error.
 */
export async function registerRoute(options: RegisterOptions): Promise<RegisterResult> {
  const { projectDir, stack, routeName, component, importFrom } = options;
  const updated: string[] = [];
  const notes: string[] = [];
  const manualHint = `Add "${routeName}: undefined;" to ${stack}StackParamList in ${TYPES_FILE}`;

  const typesPath = path.join(projectDir, TYPES_FILE);
  if (await pathExists(typesPath)) {
    const result = addRouteToTypes(await readFile(typesPath, 'utf8'), stack, routeName);
    if (result === null) {
      notes.push(`Could not find ${stack}StackParamList in ${TYPES_FILE}. ${manualHint}`);
    } else if (result.changed) {
      await writeFile(typesPath, result.text);
      updated.push(TYPES_FILE);
    }
  } else {
    notes.push(`${TYPES_FILE} not found. ${manualHint}`);
  }

  const manualNavigator = `Add "${routeName}: { screen: ${component} }" to the ${stack} stack navigator (import from ${importFrom})`;
  if (!options.navigator) {
    notes.push(`${manualNavigator}, or re-run with --register`);
    return { updated, notes };
  }
  for (const name of await navigatorFiles(projectDir)) {
    const rel = `${NAVIGATION_DIR}/${name}`;
    const file = path.join(projectDir, rel);
    const result = addScreenToNavigator(await readFile(file, 'utf8'), options);
    if (result === null) continue;
    if (result.changed) {
      await writeFile(file, result.text);
      updated.push(rel);
    }
    return { updated, notes };
  }
  notes.push(`Could not find the ${stack} stack navigator in ${NAVIGATION_DIR}. ${manualNavigator}`);
  return { updated, notes };
}

const RESOURCES_FILE = 'src/services/i18n/resources.ts';

/**
 * Registers a feature's locale files as an i18n namespace in `resources.ts` so `t()` keys are typed.
 * Idempotent; returns a note instead of failing when the file is not in the expected shape.
 */
export async function registerNamespace(projectDir: string, namespace: string, pascal: string): Promise<RegisterResult> {
  const file = path.join(projectDir, RESOURCES_FILE);
  const manual = `Register the "${namespace}" i18n namespace in ${RESOURCES_FILE}`;
  if (!(await pathExists(file))) return { updated: [], notes: [`${RESOURCES_FILE} not found. ${manual}`] };
  let text = await readFile(file, 'utf8');
  const importLine = (lang: string) => `import ${lang}${pascal} from '@locales/${lang}/${namespace}.json';`;
  if (text.includes(importLine('en'))) return { updated: [], notes: [] };
  for (const lang of ['en', 'ar']) {
    const lines = text.split('\n');
    const last = lines.findLastIndex((value) => value.startsWith(`import ${lang}`) && value.includes(`'@locales/${lang}/`));
    const block = findBlock(text, new RegExp(`^  ${lang}:\\s*\\{`, 'm'));
    if (last === -1 || !block) return { updated: [], notes: [`Could not update ${RESOURCES_FILE}. ${manual}`] };
    text = insertInBlock(text, block, `${/^[A-Za-z_]\w*$/.test(namespace) ? namespace : `'${namespace}'`}: ${lang}${pascal},`);
    const withImport = text.split('\n');
    withImport.splice(last + 1, 0, importLine(lang));
    text = withImport.join('\n');
  }
  await writeFile(file, text);
  return { updated: [RESOURCES_FILE], notes: [] };
}
