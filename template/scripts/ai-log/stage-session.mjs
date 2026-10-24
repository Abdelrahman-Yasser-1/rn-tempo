#!/usr/bin/env node
// lefthook pre-commit: stage the active session log so it travels with the commit it describes.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { git, isStale, paths, readCurrent } from './lib.mjs';
import { stopSession } from './session.mjs';

const p = paths();
const current = readCurrent(p);
if (
  current &&
  !isStale(current) &&
  process.env.AI_TRACKING !== 'off' &&
  existsSync(path.join(p.root, current.file))
) {
  stopSession(); // refresh files/commits before staging
  git(['add', current.file], { cwd: p.root });
}
