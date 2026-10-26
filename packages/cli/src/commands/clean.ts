import { confirm } from '@clack/prompts';
import { defineCommand } from 'citty';

import { planClean, runClean, type CleanTarget } from '../lib/clean.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { answer, isInteractive } from '../lib/prompt.ts';
import { readTempoJson } from '../lib/tempo-json.ts';

export default defineCommand({
  meta: { name: 'clean', description: 'Delete build and tool caches (re-runs pod install when ios/build or ios/Pods is removed)' },
  args: {
    ...commonArgs,
    'dry-run': { type: 'boolean', description: 'List what would be removed' },
    'skip-pods': { type: 'boolean', description: 'Do not re-run pod install afterwards' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const tempo = await readTempoJson(common.cwd);
      const targets = await planClean(common.cwd, tempo.app.name);
      if (args['dry-run']) {
        reporter.result({ ok: true, dryRun: true, targets: targets.map((target) => ({ id: target.id, paths: target.paths })) });
        if (!common.json) for (const target of targets) reporter.info(`would remove: ${target.label}`);
        return;
      }
      const selected: CleanTarget[] = [];
      for (const target of targets) {
        if (isInteractive(common.yes)) {
          if (!answer(await confirm({ message: `Remove ${target.label}?`, initialValue: true }))) continue;
        }
        selected.push(target);
      }
      const result = await runClean(common.cwd, selected, { json: common.json, skipPods: args['skip-pods'] });
      reporter.success(`Cleaned: ${result.removed.join(', ') || 'nothing'}${result.podsReinstalled ? ' (pod install re-run)' : ''}`);
      reporter.result({ ok: true, ...result });
    });
  },
});
