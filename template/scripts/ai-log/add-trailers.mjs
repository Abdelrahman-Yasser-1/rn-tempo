#!/usr/bin/env node
// lefthook prepare-commit-msg: `node add-trailers.mjs {1} {2}` (message file, commit source).
// Adds AI-Assisted / AI-Session / Spec trailers while an AI session is active.
import { readFileSync } from 'node:fs';
import { git, readCurrent } from './lib.mjs';
import { trailersFor } from './session.mjs';

const [messageFile, source] = process.argv.slice(2);
if (messageFile && source !== 'merge' && source !== 'squash') {
  const trailers = trailersFor(readCurrent());
  const message = readFileSync(messageFile, 'utf8');
  if (trailers.length > 0 && !/^AI-Session:/m.test(message)) {
    git([
      'interpret-trailers',
      '--in-place',
      ...trailers.flatMap((t) => ['--trailer', t]),
      messageFile,
    ]);
  }
}
