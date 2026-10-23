#!/usr/bin/env node
// Updates the active session log: end time, commits, files and summary.
// Claude Code: Stop hook (JSON on stdin with transcript_path). Other tools: `yarn ai:stop --summary "<text>"`.
import { parseArgs, readStdinJson } from './lib.mjs';
import { stopSession } from './session.mjs';

const args = parseArgs(process.argv.slice(2));
const input = await readStdinJson();
const current = stopSession({
  summary: typeof args.summary === 'string' ? args.summary : '',
  transcriptPath: input?.transcript_path ?? null,
});
if (!input && current) console.log(`AI session updated: ${current.file}`);
