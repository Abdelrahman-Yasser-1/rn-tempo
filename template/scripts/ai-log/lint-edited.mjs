#!/usr/bin/env node
// Claude Code PostToolUse hook: eslint --fix + prettier on the edited file. Never blocks (always exits 0).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readStdinJson } from './lib.mjs';

const input = await readStdinJson();
const file = input?.tool_input?.file_path;
if (file && /\.(ts|tsx|js|mjs|json|md|ya?ml)$/.test(file) && existsSync(file)) {
  // Run the tools from the nearest package that has them installed (template/ or a workspace package).
  let dir = path.dirname(file);
  while (dir !== path.dirname(dir) && !existsSync(path.join(dir, 'node_modules', '.bin', 'prettier'))) dir = path.dirname(dir);
  const bin = (name) => path.join(dir, 'node_modules', '.bin', name);
  if (/\.(ts|tsx|js|mjs)$/.test(file) && existsSync(bin('eslint'))) spawnSync(bin('eslint'), ['--fix', file], { cwd: dir, stdio: 'ignore' });
  if (existsSync(bin('prettier'))) spawnSync(bin('prettier'), ['--write', '--ignore-unknown', file], { cwd: dir, stdio: 'ignore' });
}
process.exit(0);
