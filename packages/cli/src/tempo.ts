#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import { CLI_VERSION } from './lib/version.ts';

const main = defineCommand({
  meta: { name: 'tempo', version: CLI_VERSION, description: 'Manage an RN-TEMPO project' },
  subCommands: {},
});

await runMain(main);
