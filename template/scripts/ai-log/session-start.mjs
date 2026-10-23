#!/usr/bin/env node
// Starts (or resumes) an AI session log.
// Claude Code: SessionStart hook (JSON on stdin). Other tools: `yarn ai:start --tool cursor --model <id> [--spec specs/x]`.
import { parseArgs, readStdinJson, resolveModel } from './lib.mjs';
import { startSession } from './session.mjs';

const args = parseArgs(process.argv.slice(2));
const input = await readStdinJson();
const current = startSession({
  tool: args.tool || 'other',
  model: resolveModel(input, args.model),
  spec: args.spec || process.env.AI_SPEC || null,
  sessionId: input?.session_id ?? null,
});
if (!input) console.log(`AI session: ${current.file}`);
