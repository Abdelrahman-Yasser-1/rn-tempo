import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SESSION_PATH = /^\.ai\/sessions\/[^/]+\.md$/;

function trailerValues(raw, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, 'gim');
  return [...String(raw ?? '').matchAll(pattern)].map((m) => m[1].trim());
}

/** True when the file is in the working tree or staged in the index. */
function sessionExists(relPath, cwd) {
  if (existsSync(path.join(cwd, relPath))) return true;
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relPath], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * `AI-Assisted` requires an `AI-Session` trailer pointing at an existing `.ai/sessions/*.md` log,
 * so every AI-made change can be traced back to the prompts that produced it.
 */
export default function aiSessionTrailer(parsed, when = 'always', _value, cwd = process.cwd()) {
  if (when === 'never') return [true];
  const raw = parsed.raw ?? '';
  const assisted = trailerValues(raw, 'AI-Assisted');
  const sessions = trailerValues(raw, 'AI-Session');
  if (assisted.length === 0 && sessions.length === 0) return [true];
  if (assisted.length === 0) return [false, 'AI-Session trailer requires an AI-Assisted trailer'];
  if (sessions.length === 0) return [false, 'AI-Assisted commits must include an AI-Session trailer (.ai/sessions/<file>.md)'];
  for (const session of sessions) {
    if (!SESSION_PATH.test(session)) return [false, `AI-Session must be a path like .ai/sessions/<file>.md, got "${session}"`];
    if (!sessionExists(session, cwd)) return [false, `AI-Session file not found in the working tree or index: ${session}`];
  }
  return [true];
}
