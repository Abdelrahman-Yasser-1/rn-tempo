import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { workspaceJsonSchema } from '../src/workspace/schema.ts';

const target = join(dirname(fileURLToPath(import.meta.url)), '../schemas/tempo-api.schema.json');
writeFileSync(target, `${JSON.stringify(workspaceJsonSchema(), null, 2)}\n`);
process.stdout.write(`wrote ${target}\n`);
