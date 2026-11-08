// Every src/features/<name>/ has a README.md whose "Public API" section lists exactly the names
// that the feature's index.ts exports, so the docs cannot drift from the barrel.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Removes block and line comments (the barrels hold no strings that contain `//`). */
function stripComments(source) {
  let text = source;
  for (let start = text.indexOf('/*'); start !== -1; start = text.indexOf('/*')) {
    const end = text.indexOf('*/', start + 2);
    text = text.slice(0, start) + (end === -1 ? '' : text.slice(end + 2));
  }
  return text
    .split('\n')
    .map((line) => (line.includes('//') ? line.slice(0, line.indexOf('//')) : line))
    .join('\n');
}

/** Names a `{ a, type B, c as d }` list exports: the alias when there is one, without `type`. */
function namesOfBraces(list) {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const withoutType = part.replace(/^type\s+/, '');
      const alias = /\bas\s+([\w$]+)$/.exec(withoutType);
      return alias ? alias[1] : withoutType;
    });
}

/** Names exported by a barrel: `export { a } from`, `export type { A }`, `export const|function|type|...`. */
export function parseExports(source) {
  const text = stripComments(source);
  if (text.split('\n').some((line) => line.trimStart().startsWith('export *'))) {
    throw new Error('`export *` is not allowed in a feature barrel; name every export');
  }
  const names = new Set();
  for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const name of namesOfBraces(match[1])) {
      names.add(name);
    }
  }
  const declarations = [
    /export (?:declare )?(?:const|let|var|class|type|interface|enum) ([\w$]+)/g,
    /export (?:declare )?(?:async )?function\*? ([\w$]+)/g,
  ];
  for (const pattern of declarations) {
    for (const match of text.matchAll(pattern)) {
      names.add(match[1]);
    }
  }
  return names;
}

/** Names listed in the "Public API" section: the first backticked word of each bullet. Undefined without the section. */
export function parsePublicApi(readme) {
  const lines = readme.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+public api\s*$/i.test(line.trim()));
  if (start === -1) {
    return;
  }
  const names = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) {
      break;
    }
    const match = /^\s*[-*]\s+`([^`]+)`/.exec(line);
    if (match) {
      names.add(match[1].trim());
    }
  }
  return names;
}

/** Problems of one feature, as report lines; empty when its README matches its barrel. */
export function checkFeature({ name, indexSource, readme }) {
  const where = `src/features/${name}`;
  if (indexSource === undefined) {
    return [`${where}/index.ts is missing.`];
  }
  if (readme === undefined) {
    return [`${where}/README.md is missing.`];
  }
  const documented = parsePublicApi(readme);
  if (documented === undefined) {
    return [`${where}/README.md has no "## Public API" section.`];
  }
  const exported = parseExports(indexSource);
  const missing = [...exported].filter((entry) => !documented.has(entry)).sort();
  const extra = [...documented].filter((entry) => !exported.has(entry)).sort();
  const problems = [];
  if (missing.length > 0) {
    problems.push(`${where}/README.md: Public API is missing ${missing.join(', ')}.`);
  }
  if (extra.length > 0) {
    problems.push(
      `${where}/README.md: Public API lists ${extra.join(', ')}, which index.ts does not export.`,
    );
  }
  return problems;
}

/** Reads every feature folder under `src/features` of `root`. */
export function readFeatures(root) {
  const base = join(root, 'src', 'features');
  if (!existsSync(base)) {
    return [];
  }
  return readdirSync(base)
    .filter((entry) => statSync(join(base, entry)).isDirectory())
    .sort()
    .map((name) => {
      const read = (file) =>
        existsSync(join(base, name, file))
          ? readFileSync(join(base, name, file), 'utf8')
          : undefined;
      return { name, indexSource: read('index.ts'), readme: read('README.md') };
    });
}

/** Problems of every feature under `root`. */
export function checkFeatures(root) {
  return readFeatures(root).flatMap((feature) => checkFeature(feature));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkFeatures(root);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
