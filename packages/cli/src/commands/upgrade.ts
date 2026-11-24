import { defineCommand } from 'citty';

import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { upgrade } from '../lib/upgrade.ts';

export default defineCommand({
  meta: { name: 'upgrade', description: 'Preview or apply a template release patch' },
  args: {
    ...commonArgs,
    to: { type: 'string', description: 'Target release version (defaults to latest)' },
    template: { type: 'string', description: 'Target template folder or giget source' },
    apply: { type: 'boolean', description: 'Apply the patch in a clean Git working tree' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const result = await upgrade({ ...common, to: args.to, template: args.template, apply: args.apply });
      if (result.patch === null) reporter.info(`Already up to date (${result.from}).`);
      else {
        reporter.info(`${result.from} → ${result.to}  ${result.patch}`);
        for (const kind of ['added', 'changed', 'removed'] as const) {
          const files = result[kind];
          reporter.info(`${files.length} ${kind}  ${files.slice(0, 5).join(', ')}${files.length > 5 ? ' …' : ''}`);
        }
        if (result.lockfiles.length) reporter.info(`Reinstall to refresh: ${result.lockfiles.join(', ')}`);
        if (result.applied) reporter.success('Applied the patch and updated templateVersion.');
        if (result.conflicts.length)
          reporter.warn(`Resolve the conflicts left in your working tree and index: ${result.conflicts.join(', ')}`);
        reporter.info('Upgrade guide: /docs/cli/upgrade');
      }
      reporter.result(result);
      if (!result.ok) process.exitCode = 1;
    });
  },
});
