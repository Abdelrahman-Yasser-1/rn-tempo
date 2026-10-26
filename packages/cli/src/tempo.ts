#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';

import { CLI_VERSION } from './lib/version.ts';

const main = defineCommand({
  meta: { name: 'tempo', version: CLI_VERSION, description: 'Manage an RN-TEMPO project' },
  subCommands: {
    g: () => import('./commands/generate.ts').then((m) => m.default),
    generate: () => import('./commands/generate.ts').then((m) => m.default),
    env: () => import('./commands/env.ts').then((m) => m.default),
    icons: () => import('./commands/icons.ts').then((m) => m.default),
    rename: () => import('./commands/rename.ts').then((m) => m.default),
    feature: () => import('./commands/feature.ts').then((m) => m.default),
    assets: () => import('./commands/assets.ts').then((m) => m.default),
    clean: () => import('./commands/clean.ts').then((m) => m.default),
    doctor: () => import('./commands/doctor.ts').then((m) => m.default),
  },
});

await runMain(main);
