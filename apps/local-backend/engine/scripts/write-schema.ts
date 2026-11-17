import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { backendJsonSchema } from '../src/schema.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '../schemas/backend.schema.json');
writeFileSync(target, `${JSON.stringify(backendJsonSchema(), null, 2)}\n`);
process.stdout.write(`wrote ${target}\n`);
