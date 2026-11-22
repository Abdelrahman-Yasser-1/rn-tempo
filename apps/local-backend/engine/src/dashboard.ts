import { extname } from 'node:path';

import { readDashboardAsset, type AssetSources } from './assets.ts';
import { problemReply, type Reply } from './http.ts';

/**
 * The Content Security Policy of the web dashboard. It matches the desktop one (`tauri.conf.json`): scripts only from the
 * same origin (no inline script, no `eval`), `connect-src 'self'` so the page can only talk to the server it came from,
 * and no framing. Monaco's two workers are same-origin files (`worker-src 'self'`; no `blob:`, no CDN).
 *
 * Styles allow `'unsafe-inline'`, for styles ONLY. Monaco writes its theme colours and codicon rules into `<style>` elements
 * it creates at run time (`style.textContent = ...`), and it offers no way to put a nonce on them; a hash would change with
 * every theme and Monaco release. Inline styles cannot run code, and `script-src` stays `'self'`.
 */
export const DASHBOARD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "worker-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Headers for every answer of the admin listener, API and pages alike. */
export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': DASHBOARD_CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Plain relative paths only: segments of letters, digits, dot, dash and underscore, none starting with a dot. */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

/** The pages that show the app. The sign-in is a screen of the same app, so `/login` is the same file. */
const PAGES = new Set(['/', '/login']);

const MISSING = 'The dashboard is not part of this install. Build it with `yarn workspace @rn-tempo/local-backend build:dashboard`, or install the published package.';

/**
 * Answers a GET for the dashboard: the app page at `/` and `/login`, and its files by name. Files with a content
 * hash in the name (Vite puts them under `assets/`) are cached for a year; the page itself is never cached, so a new
 * build shows up at once. Anything else is a 404 (the dashboard has no other routes).
 */
export function dashboardReply(path: string, sources?: AssetSources): Reply {
  const page = PAGES.has(path);
  const name = page ? 'index.html' : path.slice(1);
  if (!page && (path.includes('%') || !SAFE_PATH.test(name))) return problemReply(404, { detail: 'Not found.' });
  const bytes = readDashboardAsset(name, sources);
  if (bytes === undefined) {
    return page ? { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' }, raw: MISSING } : problemReply(404, { detail: 'Not found.' });
  }
  const hashed = name.startsWith('assets/');
  return {
    status: 200,
    headers: {
      'content-type': TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
    raw: bytes,
  };
}
