// Shared helpers for the AI session log scripts. No npm dependencies on purpose:
// these run from git hooks and AI-tool hooks before `yarn install` may have happened.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    }).trim();
  } catch {
    return '';
  }
}

/** Repo root; `AI_LOG_ROOT` overrides it so tests can run in a temp dir. */
export function repoRoot() {
  return process.env.AI_LOG_ROOT || git(['rev-parse', '--show-toplevel']) || process.cwd();
}

export function paths(root = repoRoot()) {
  const aiDir = path.join(root, '.ai');
  return {
    root,
    aiDir,
    sessionsDir: path.join(aiDir, 'sessions'),
    currentFile: path.join(aiDir, '.current.json'),
    redactFile: path.join(aiDir, 'redact.json'),
  };
}

/** Reads stdin JSON when piped (AI-tool hooks); returns null for TTYs or empty/slow input. */
export async function readStdinJson(timeoutMs = 300) {
  if (process.stdin.isTTY) return null;
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => finish(), timeoutMs);
    function finish() {
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.pause();
      if (!data.trim()) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

/** Minimal `--key value` / `--flag` parser; positional args land in `_`. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(arg);
  }
  return out;
}

export function readCurrent(p = paths()) {
  if (!existsSync(p.currentFile)) return null;
  try {
    return JSON.parse(readFileSync(p.currentFile, 'utf8'));
  } catch {
    return null;
  }
}

export function isStale(current, now = Date.now()) {
  return !current?.startedAt || now - Date.parse(current.startedAt) > STALE_AFTER_MS;
}

export function writeCurrent(current, p = paths()) {
  mkdirSync(p.aiDir, { recursive: true });
  writeFileSync(p.currentFile, JSON.stringify(current, null, 2) + '\n');
}

/** Prompt logging mode from `.tempo.json` (`ai.logPrompts`): full | summary | off. */
export function logPromptsMode(root = repoRoot()) {
  for (const candidate of [
    path.join(root, '.tempo.json'),
    path.join(root, 'template', '.tempo.json'),
  ]) {
    if (!existsSync(candidate)) continue;
    try {
      const mode = JSON.parse(readFileSync(candidate, 'utf8'))?.ai?.logPrompts;
      if (['full', 'summary', 'off'].includes(mode)) return mode;
    } catch {
      // fall through to the default
    }
  }
  return 'full';
}

export function shortId(seed) {
  const clean = String(seed ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return clean.length >= 6 ? clean.slice(0, 6) : randomBytes(3).toString('hex');
}

export function isoNow(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Normalizes the model field, which hooks may send as a string or `{ id, display_name }`. */
export function resolveModel(input, fallback) {
  const fromInput = typeof input?.model === 'string' ? input.model : input?.model?.id;
  return process.env.ANTHROPIC_MODEL || fromInput || fallback || 'unknown';
}

// ── Session document (YAML-ish frontmatter + markdown sections) ──────────────

const FRONTMATTER_KEYS = [
  'id',
  'tool',
  'model',
  'author',
  'branch',
  'spec',
  'started',
  'ended',
  'commits',
  'files',
];

function formatValue(value) {
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(String(v))).join(', ')}]`;
  if (value === null || value === undefined || value === '') return 'null';
  return JSON.stringify(String(value));
}

function parseValue(raw) {
  const value = raw.trim();
  if (value === 'null' || value === '') return null;
  if (value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseSession(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const meta = {};
  if (!match) return { meta, body: text };
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1));
  }
  return { meta, body: match[2] };
}

export function serializeSession({ meta, body }) {
  const lines = FRONTMATTER_KEYS.map((key) => `${key}: ${formatValue(meta[key])}`);
  return `---\n${lines.join('\n')}\n---\n${body.startsWith('\n') ? body : `\n${body}`}`;
}

export const EMPTY_BODY = '\n## Prompts\n\n## Summary\n\n## Follow-ups\n';

/** Replaces (or appends) the content of a `## <title>` section. */
export function setSection(body, title, content) {
  const heading = `## ${title}`;
  const start = body.indexOf(heading);
  if (start === -1) return `${body.trimEnd()}\n\n${heading}\n${content.trimEnd()}\n`;
  const afterHeading = start + heading.length;
  const nextIdx = body.indexOf('\n## ', afterHeading);
  const end = nextIdx === -1 ? body.length : nextIdx + 1;
  return `${body.slice(0, afterHeading)}\n${content.trimEnd()}\n\n${body.slice(end)}`.replace(
    /\n{3,}/g,
    '\n\n',
  );
}

export function getSection(body, title) {
  const heading = `## ${title}`;
  const start = body.indexOf(heading);
  if (start === -1) return '';
  const afterHeading = start + heading.length;
  const nextIdx = body.indexOf('\n## ', afterHeading);
  return body.slice(afterHeading, nextIdx === -1 ? body.length : nextIdx).trim();
}

export function readSessionFile(root, relFile) {
  const abs = path.join(root, relFile);
  if (!existsSync(abs)) return null;
  return parseSession(readFileSync(abs, 'utf8'));
}

export function writeSessionFile(root, relFile, doc) {
  const abs = path.join(root, relFile);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, serializeSession(doc));
}
