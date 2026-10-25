import { defineCommand } from 'citty';

import { hasErrors, renderMarkdown, runDoctor } from '../lib/doctor.ts';
import { commonArgs, resolveCommon, runGuarded } from '../lib/output.ts';
import { CLI_VERSION } from '../lib/version.ts';

export default defineCommand({
  meta: { name: 'doctor', description: 'Check the toolchain and the project for problems' },
  args: {
    ...commonArgs,
    ci: { type: 'boolean', description: 'Print a markdown report and exit non-zero only on errors' },
    offline: { type: 'boolean', description: 'Skip checks that need the npm registry' },
    'skip-lint': { type: 'boolean', description: 'Skip the ls-lint and eslint structure run' },
  },
  async run({ args }) {
    const common = resolveCommon(args);
    await runGuarded(common.json, async (reporter) => {
      const checks = await runDoctor(common.cwd, { offline: args.offline, skipLint: args['skip-lint'], cliVersion: CLI_VERSION });
      const failed = hasErrors(checks);
      reporter.result({ ok: !failed, checks });
      if (!common.json) {
        if (args.ci) process.stdout.write(`${renderMarkdown(checks)}\n`);
        else {
          for (const check of checks) {
            const line = `${check.title}: ${check.message}`;
            if (check.status === 'error') reporter.error(line);
            else if (check.status === 'warn') reporter.warn(line);
            else if (check.status === 'ok') reporter.success(line);
            else reporter.info(line);
          }
        }
      }
      if (failed) process.exitCode = 1;
    });
  },
});
