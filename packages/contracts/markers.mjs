// Feature-marker syntax (contract C7.2), shared by the CLI (strip) and CI (balance check).

export const FEATURE_NAMES = Object.freeze([
  'ssl-pinning',
  'device-integrity',
  'storybook',
  'dynamic-forms',
  'samples',
  'maestro',
  'ci-github',
  'ai-claude',
  'ai-cursor',
  'ai-copilot',
]);

const SLASH = { start: (n) => `// @tempo-feature:${n}:start`, end: (n) => `// @tempo-feature:${n}:end`, single: (n) => `// @tempo-feature:${n}` };
const JSX = { start: (n) => `{/* @tempo-feature:${n}:start */}`, end: (n) => `{/* @tempo-feature:${n}:end */}`, single: null };
const XML = { start: (n) => `<!-- @tempo-feature:${n}:start -->`, end: (n) => `<!-- @tempo-feature:${n}:end -->`, single: null };
const HASH = { start: (n) => `# @tempo-feature:${n}:start`, end: (n) => `# @tempo-feature:${n}:end`, single: (n) => `# @tempo-feature:${n}` };

/** Comment styles per file type. JSX markers are also valid inside .tsx/.jsx files. */
export const COMMENT_STYLES = Object.freeze({ slash: SLASH, jsx: JSX, xml: XML, hash: HASH });

const SLASH_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'kt', 'kts', 'swift', 'gradle', 'java', 'm', 'mm', 'h']);
const XML_EXT = new Set(['xml', 'plist', 'storyboard', 'xcscheme', 'entitlements']);
const HASH_EXT = new Set(['rb', 'yml', 'yaml', 'sh', 'properties', 'toml']);
const HASH_FILES = new Set(['Podfile', 'Gemfile', 'Fastfile', 'Appfile', 'Matchfile', 'Pluginfile', 'Dangerfile']);

/** Returns the comment style(s) allowed for a file, or [] when markers are not allowed (e.g. JSON). */
export function commentStylesFor(filePath) {
  const base = filePath.split('/').pop() ?? '';
  if (HASH_FILES.has(base) || base.startsWith('.env')) return ['hash'];
  const ext = base.includes('.') ? base.split('.').pop() : '';
  if (ext === 'tsx' || ext === 'jsx') return ['slash', 'jsx'];
  if (SLASH_EXT.has(ext)) return ['slash'];
  if (XML_EXT.has(ext)) return ['xml'];
  if (HASH_EXT.has(ext)) return ['hash'];
  return [];
}

const MARKER_RE = /@tempo-feature:([a-z0-9-]+)(?::(start|end))?/;

/** Finds every marker in a text. `kind` is start | end | single; `line` is 1-based. */
export function scanMarkers(text) {
  const found = [];
  text.split('\n').forEach((content, i) => {
    const match = MARKER_RE.exec(content);
    if (match) found.push({ name: match[1], kind: match[2] ?? 'single', line: i + 1 });
  });
  return found;
}

/** Returns a list of human-readable problems: unknown names, unbalanced or nested regions. */
export function validateMarkers(text, filePath = '<text>') {
  const problems = [];
  const open = [];
  for (const marker of scanMarkers(text)) {
    if (!FEATURE_NAMES.includes(marker.name)) problems.push(`${filePath}:${marker.line} unknown feature "${marker.name}"`);
    if (marker.kind === 'start') {
      if (open.length > 0) problems.push(`${filePath}:${marker.line} nested region "${marker.name}" inside "${open.at(-1).name}"`);
      open.push(marker);
    } else if (marker.kind === 'end') {
      const top = open.pop();
      if (!top) problems.push(`${filePath}:${marker.line} end of "${marker.name}" without start`);
      else if (top.name !== marker.name) problems.push(`${filePath}:${marker.line} end of "${marker.name}" closes "${top.name}" (line ${top.line})`);
    }
  }
  for (const marker of open) problems.push(`${filePath}:${marker.line} region "${marker.name}" is never closed`);
  return problems;
}

/** Removes a feature's regions (inclusive) and single-line markers. Throws on unbalanced markers. */
export function stripFeature(text, name, filePath = '<text>') {
  const problems = validateMarkers(text, filePath);
  if (problems.length > 0) throw new Error(`Invalid feature markers:\n${problems.join('\n')}`);
  const lines = text.split('\n');
  const out = [];
  let skipping = false;
  for (const content of lines) {
    const match = MARKER_RE.exec(content);
    if (match && match[1] === name) {
      if (match[2] === 'start') skipping = true;
      else if (match[2] === 'end') skipping = false;
      continue; // drop marker lines and single-line marked lines
    }
    if (!skipping) out.push(content);
  }
  return out.join('\n');
}
