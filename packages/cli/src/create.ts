#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import { CLI_VERSION } from './lib/version.ts';

const main = defineCommand({
  meta: { name: 'create-tempo-app', version: CLI_VERSION, description: 'Create an RN-TEMPO app' },
});

await runMain(main);
