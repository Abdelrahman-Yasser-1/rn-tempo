import path from 'node:path';

import { defineCommand } from 'citty';

import { CliError } from '../lib/errors.ts';
import { pathExists } from '../lib/fs-utils.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { run } from '../lib/pm.ts';

export const ASSETS_SCRIPT = 'scripts/assets.mjs';

const sync = defineCommand({
  meta: { name: 'sync', description: 'Validate src/assets and regenerate the typed registries (yarn assets)' },
  args: { ...commonArgs },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      if (!(await pathExists(path.join(common.cwd, ASSETS_SCRIPT)))) {
        throw new CliError(`${ASSETS_SCRIPT} not found; run this inside a tempo project that ships the asset generator`, { code: 'ASSETS_SCRIPT_MISSING' });
      }
      await run('node', [ASSETS_SCRIPT], { cwd: common.cwd, json: common.json });
      reporter.success('Asset registries regenerated');
      reporter.result({ ok: true });
    });
  },
});

export default defineCommand({
  meta: { name: 'assets', description: 'Asset registry tools' },
  subCommands: { sync },
});
