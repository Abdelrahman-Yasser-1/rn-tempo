#!/usr/bin/env node
import { runMain } from 'citty';

import create from './commands/create.ts';

await runMain(create);
