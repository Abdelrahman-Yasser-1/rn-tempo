import { existsSync, readFileSync } from 'node:fs';

// Order matters: multi-line keys first so their inner lines aren't partially matched.
const BUILT_IN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, // JWT
  /Bearer\s+\S+/gi,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_\w{20,}/g, // GitHub tokens
  /\bsk-[A-Za-z0-9_-]{20,}/g, // common API secret keys
  /\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)\S+/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // emails
];

export const REDACTED = '[REDACTED]';

/** Loads extra regex sources from `.ai/redact.json` (`{ "patterns": ["..."] }`). */
export function loadExtraPatterns(redactFile) {
  if (!redactFile || !existsSync(redactFile)) return [];
  try {
    const { patterns = [] } = JSON.parse(readFileSync(redactFile, 'utf8'));
    return patterns.map((source) => new RegExp(source, 'g'));
  } catch {
    return [];
  }
}

/** Masks secrets and personal data before a prompt is written to a committed log. */
export function redact(text, extraPatterns = []) {
  let out = String(text ?? '');
  for (const pattern of [...BUILT_IN_PATTERNS, ...extraPatterns]) {
    out = out.replace(pattern, (match, key, sep) =>
      // Keep the key name for `key=value` matches so the log stays readable.
      typeof key === 'string' && typeof sep === 'string' && /^[a-z_-]+$/i.test(key)
        ? `${key}${sep}${REDACTED}`
        : REDACTED,
    );
  }
  return out;
}
