#!/usr/bin/env node
// Appends a prompt to the active AI session log (starting one if needed).
// Claude Code: UserPromptSubmit hook (JSON on stdin). Other tools: `yarn ai:prompt "<text>" [--tool t --model m]`.
import { parseArgs, readStdinJson, resolveModel } from './lib.mjs';
import { appendPrompt } from './session.mjs';

const args = parseArgs(process.argv.slice(2));
const input = await readStdinJson();
const text = input?.prompt ?? args._.join(' ');
if (text.trim()) {
  appendPrompt(text, {
    tool: input ? 'claude-code' : args.tool || 'other',
    model: resolveModel(input, args.model),
    spec: args.spec || process.env.AI_SPEC || null,
    sessionId: input?.session_id ?? null,
  });
}
