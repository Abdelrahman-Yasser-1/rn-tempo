import path from 'node:path';

import { CliError } from './errors.ts';
import { pathExists } from './fs-utils.ts';
import { run, type Runner } from './pm.ts';

export const ICONS_SCRIPT = 'scripts/native/icons.mjs';

/**
 * Regenerates the launcher icons by running the project's own `scripts/native/icons.mjs`. The script
 * reads the env matrix (name + badge) from `.tempo.json`, so callers update that file first.
 */
export async function runIcons(dir: string, options: { runner?: Runner; json?: boolean } = {}): Promise<void> {
  if (!(await pathExists(path.join(dir, ICONS_SCRIPT)))) {
    throw new CliError(`${ICONS_SCRIPT} not found; run this inside a tempo project`, { code: 'ICONS_SCRIPT_MISSING' });
  }
  await (options.runner ?? run)('node', [ICONS_SCRIPT], { cwd: dir, json: options.json });
}
