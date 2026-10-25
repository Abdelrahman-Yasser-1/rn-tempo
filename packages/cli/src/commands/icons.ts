import { defineCommand } from 'citty';

import { runIcons } from '../lib/icons.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { readTempoJson } from '../lib/tempo-json.ts';

export default defineCommand({
  meta: { name: 'icons', description: 'Regenerate launcher icons for every env' },
  args: { ...commonArgs },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const tempo = await readTempoJson(common.cwd);
      await runIcons(common.cwd, { json: common.json });
      reporter.success('Icons regenerated');
      reporter.result({ ok: true, envs: tempo.envs.map((env) => env.name) });
    });
  },
});
