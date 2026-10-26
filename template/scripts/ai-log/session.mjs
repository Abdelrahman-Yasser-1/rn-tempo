// Core session operations, shared by the CLI entry scripts and the tests.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EMPTY_BODY,
  getSection,
  git,
  isStale,
  isoNow,
  logPromptsMode,
  paths,
  readCurrent,
  readSessionFile,
  setSection,
  shortId,
  writeCurrent,
  writeSessionFile,
} from './lib.mjs';
import { loadExtraPatterns, redact } from './redact.mjs';

const SUMMARY_MAX = 2000;
const PROMPT_SUMMARY_MAX = 140;

function author(root) {
  const name = git(['config', 'user.name'], { cwd: root });
  const email = git(['config', 'user.email'], { cwd: root });
  return email ? `${name} <${email}>` : name || 'unknown';
}

function sessionFileName(date, tool, id) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${day}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}-${tool}-${id}.md`;
}

/**
 * Starts a session, or resumes the active one when the session id matches
 * (or when no id is given and the active session is still fresh).
 */
export function startSession({
  tool = 'other',
  model = 'unknown',
  spec = null,
  sessionId = null,
  now = new Date(),
} = {}) {
  const p = paths();
  const current = readCurrent(p);
  const sameSession = sessionId
    ? current?.sessionId === sessionId
    : current && !isStale(current, now.getTime());
  if (current && sameSession && existsSync(path.join(p.root, current.file))) return current;

  const id = shortId(sessionId);
  const rel = path.posix.join('.ai', 'sessions', sessionFileName(now, tool, id));
  const meta = {
    id: path.basename(rel, '.md'),
    tool,
    model,
    author: author(p.root),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: p.root }) || null,
    spec,
    started: isoNow(now),
    ended: null,
    commits: [],
    files: [],
  };
  writeSessionFile(p.root, rel, { meta, body: EMPTY_BODY });
  const next = {
    file: rel,
    sessionId: sessionId ?? meta.id,
    tool,
    model,
    spec,
    startSha: git(['rev-parse', 'HEAD'], { cwd: p.root }) || null,
    startedAt: meta.started,
  };
  writeCurrent(next, p);
  return next;
}

export function formatPrompt(text, mode, extraPatterns) {
  if (mode === 'off') return '(prompt not logged)';
  const clean = redact(text, extraPatterns).trim();
  if (mode === 'summary' && clean.length > PROMPT_SUMMARY_MAX)
    return `${clean.slice(0, PROMPT_SUMMARY_MAX)}…`;
  return clean;
}

/** Appends one prompt (redacted per `.tempo.json` `ai.logPrompts`) to the active session. */
export function appendPrompt(text, { now = new Date(), ...startOpts } = {}) {
  const p = paths();
  const current = startSession({ now, ...startOpts });
  const doc = readSessionFile(p.root, current.file);
  const existing = getSection(doc.body, 'Prompts');
  const count = (existing.match(/^### \d+ · /gm) ?? []).length;
  const entry = `### ${count + 1} · ${isoNow(now)}\n${formatPrompt(text, logPromptsMode(p.root), loadExtraPatterns(p.redactFile))}`;
  doc.body = setSection(doc.body, 'Prompts', existing ? `${existing}\n\n${entry}` : entry);
  writeSessionFile(p.root, current.file, doc);
  return current;
}

/** Last assistant text message from a Claude Code transcript (JSONL). */
export function lastAssistantText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return '';
  const lines = readFileSync(transcriptPath, 'utf8').trim().split('\n').reverse();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const message = entry.message ?? entry;
      if ((entry.type ?? message.role) !== 'assistant') continue;
      const content = message.content;
      const text =
        typeof content === 'string'
          ? content
          : (content ?? [])
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
      if (text.trim()) return text.trim();
    } catch {
      // skip malformed lines
    }
  }
  return '';
}

function changedFiles(root, startSha) {
  const files = new Set();
  if (startSha)
    for (const f of git(['diff', '--name-only', startSha], { cwd: root }).split('\n'))
      if (f) files.add(f);
  for (const line of git(['status', '--porcelain'], { cwd: root }).split('\n')) {
    const file = line.slice(3).trim();
    if (file) files.add(file.includes(' -> ') ? file.split(' -> ')[1] : file);
  }
  // The session log itself is bookkeeping, not part of the change.
  return [...files].filter((f) => !f.startsWith('.ai/')).sort();
}

/** Refreshes ended/commits/files and replaces the summary. */
export function stopSession({ summary = '', transcriptPath = null, now = new Date() } = {}) {
  const p = paths();
  const current = readCurrent(p);
  if (!current) return null;
  const doc = readSessionFile(p.root, current.file);
  if (!doc) return null;
  const range = current.startSha ? `${current.startSha}..HEAD` : 'HEAD';
  const commits = current.startSha
    ? git(['log', range, '--format=%h'], { cwd: p.root }).split('\n').filter(Boolean).reverse()
    : [];
  doc.meta.ended = isoNow(now);
  doc.meta.commits = commits;
  doc.meta.files = changedFiles(p.root, current.startSha);
  const text = (summary || lastAssistantText(transcriptPath)).trim();
  if (text) {
    const extra = loadExtraPatterns(p.redactFile);
    const clean = redact(text, extra);
    doc.body = setSection(
      doc.body,
      'Summary',
      clean.length > SUMMARY_MAX ? `${clean.slice(0, SUMMARY_MAX)}…` : clean,
    );
  }
  writeSessionFile(p.root, current.file, doc);
  return current;
}

/** Trailer lines (AI-Assisted, optional Spec) for the active, fresh session — or [] when tracking does not apply. */
export function trailersFor(current, now = Date.now()) {
  if (!current || isStale(current, now) || process.env.AI_TRACKING === 'off') return [];
  const lines = [`AI-Assisted: ${current.tool}/${current.model}`];
  if (current.spec) lines.push(`Spec: ${current.spec}`);
  return lines;
}
