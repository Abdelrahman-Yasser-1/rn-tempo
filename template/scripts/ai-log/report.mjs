#!/usr/bin/env node
// Prints AI-assisted commit stats from commit trailers: `yarn ai:report [--since 30d]`.
import { git, parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const since = String(args.since || '30d').replace(/d$/, '.days');
const log = git(['log', `--since=${since}`, '--format=%h%x09%an%x09%(trailers:key=AI-Assisted,valueonly,separator=%x2C)']);
const rows = log.split('\n').filter(Boolean).map((line) => line.split('\t'));
const total = rows.length;
const assisted = rows.filter(([, , ai]) => ai?.trim());
const byKey = new Map();
for (const [, authorName, ai] of assisted) {
  const key = `${ai.trim()}\t${authorName}`;
  byKey.set(key, (byKey.get(key) ?? 0) + 1);
}
console.log(`Commits since ${args.since || '30d'}: ${total} · AI-assisted: ${assisted.length}${total ? ` (${Math.round((assisted.length / total) * 100)}%)` : ''}`);
for (const [key, count] of [...byKey.entries()].sort((a, b) => b[1] - a[1])) {
  const [tool, authorName] = key.split('\t');
  console.log(`  ${String(count).padStart(4)}  ${tool.padEnd(40)} ${authorName}`);
}
