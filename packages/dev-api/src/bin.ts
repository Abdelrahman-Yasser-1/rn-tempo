#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import pkg from '../package.json' with { type: 'json' };
import { check, collections, generateAll, msw, openapi } from './cli/generate.ts';
import { dev } from './cli/dev.ts';
import { trust } from './cli/trust.ts';
import { certs, down, logs, reset, scenario, start, status, up } from './cli/commands.ts';

const main = defineCommand({
  meta: { name: 'tempo-api', version: pkg.version, description: 'RN-TEMPO dev API: a local mock server for your app' },
  subCommands: { certs, trust, dev, up, down, status, logs, reset, scenario, start, openapi, collections, msw, generate: generateAll, check },
});

await runMain(main);
